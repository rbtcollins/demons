(async function () {
    function push_colour(colours, red, green, blue) {
        let pos = 4 + colours[0] * 4; // 4, 8, 12, ...
        colours[0] += 1;
        colours[pos++] = red / 255.0;
        colours[pos++] = green / 255.0;
        colours[pos++] = blue / 255.0;
        colours[pos] = 1.0;
    }
    function set_states(colours, states) {
        // no colours
        colours.splice(4, colours.length);
        colours[0] = 0;

        if (states <= 8) {
            (function () {
                push_colour(colours, 0, 0, 0);
                if (states == 1) { return; }
                push_colour(colours, 255, 0, 0);
                if (states == 2) { return; }
                push_colour(colours, 255, 255, 0);
                if (states == 3) { return; }
                push_colour(colours, 0, 255, 0);
                if (states == 4) { return; }
                push_colour(colours, 0, 255, 255);
                if (states == 5) { return; }
                push_colour(colours, 0, 0, 255);
                if (states == 6) { return; }
                push_colour(colours, 255, 0, 255);
                if (states == 7) { return; }
                push_colour(colours, 255, 255, 255);
            })();
        } else {
            // total number of steps : one per state total amount of colour
            // range to move across: 8 transitions of 255, divided by steps.
            let colour_range = 255.0;
            let excess = states % 8;
            let quotient = (states - excess) / 8;
            let excess_step = colour_range / (quotient + 1);
            let quotient_step = colour_range / quotient;
            var step_size;
            var steps;
            let add_colour = function (stage, a_r, b_r, a_g, b_g, a_b, b_b) {
                if (excess > stage) {
                    steps = quotient + 1;
                    step_size = excess_step;
                } else {
                    steps = quotient;
                    step_size = quotient_step;
                }

                for (let i = 0; i < steps; i++) {
                    let step = Math.round(i * step_size);
                    push_colour(colours, a_r + b_r * step, a_g + b_g * step, a_b + b_b * step);
                }
            }
            // white to black
            add_colour(0, 255, -1, 255, -1, 255, -1);
            // black to red
            add_colour(1, 0, 1, 0, 0, 0, 0);
            // red to brown
            add_colour(2, 255, 0, 0, 1, 0, 0);
            // brown to green
            add_colour(3, 255, -1, 255, 0, 0, 0);
            // green to cyan
            add_colour(4, 0, 0, 255, 0, 0, 1);
            // cyan to blue
            add_colour(5, 0, 0, 255, -1, 255, 0);
            // blue to magenta
            add_colour(6, 0, 1, 0, 0, 255, 0);
            // magenta to white
            add_colour(7, 255, 0, 0, 1, 255, 0);
        }

        const buffer = device.createBuffer({
            label: `states: ${states}`,
            mappedAtCreation: true,
            size: (colours[0] + 1) * 16, // vec4<u32> size + vec4<f32>
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });
        new Uint32Array(buffer.getMappedRange(0, 16)).set(colours.slice(0, 4));
        new Float32Array(buffer.getMappedRange(16)).set(colours.slice(4,));
        buffer.unmap();

        return buffer;
    }
    const canvasHolder = document.getElementById('canvasholder');
    if (canvasHolder === null) throw 'missing canvasholder element';
    const canvas = document.querySelector("canvas");
    if (canvas === null) {
        throw 'missing canvas';
    }
    const width = canvasHolder.scrollWidth;
    const height = canvasHolder.scrollHeight;
    console.log(width, height);
    canvas.width = width;
    canvas.height = height;
    const renderBtn = document.getElementById('render');
    // @type {HTMLInputElement}
    const rangeCtl = document.getElementById('states');
    if (rangeCtl === null) throw 'missing range control';
    const supportedDiv = document.getElementById("supported");
    if (supportedDiv === null) {
        throw 'missing supported div';
    }

    supportedDiv.innerHTML = `<input disabled="true" type="checkbox" checked="${'gpu' in navigator}"/>`;

    const gpuContext = canvas.getContext("webgpu");
    if (gpuContext === null) throw 'missing GPU Context';

    console.log(canvas, gpuContext);

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw 'missing adapter';
    const device = await adapter.requestDevice();
    if (!device) throw 'missing device';

    const swapChainFormat = gpuContext.getPreferredFormat(adapter);
    const renderFormat = "rgba8unorm";
    console.log(swapChainFormat);
    const swapChainDescriptor = {
        device: device,
        format: swapChainFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        compositingAlphaMode: "premultiplied",
    };

    gpuContext.configure(swapChainDescriptor);

    // Color map:
    let colours = [0, 0, 0, 0]; // 1 value, 3 pads
    var gpuBufferColours = set_states(colours, 15);
    console.log(device);

    // Dimensions buffer
    const dimensions = [width, height];
    const gpuDimensionsBuffer = device.createBuffer({
        mappedAtCreation: true,
        size: 8, // u32 * 2
        usage: GPUBufferUsage.STORAGE,
    });
    {
        const dimMatrix = new Uint32Array(dimensions);
        const bufferMatrix = gpuDimensionsBuffer.getMappedRange();
        new Uint32Array(bufferMatrix).set(dimMatrix);
        gpuDimensionsBuffer.unmap();
    }

    // First Matrix
    const gpuBufferFirstMatrix = device.createBuffer({
        mappedAtCreation: false,
        size: width * height * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Result Matrix
    const resultMatrixBufferSize = Uint32Array.BYTES_PER_ELEMENT * (width * height);
    const resultMatrixBuffer = device.createBuffer({
        size: resultMatrixBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    const randomise_content = function (flipped) {
        /// -----------
        var _newMatrix = [
        ];
        for (let o = 0; o < width * height; o++) {
            _newMatrix.push(Math.floor(Math.random() * colours[0]));
        }
        const newMatrix = new Uint32Array(_newMatrix);
        const gpuBufferNewMatrix = device.createBuffer({
            mappedAtCreation: true,
            size: newMatrix.byteLength,
            usage: GPUBufferUsage.COPY_SRC,
        });
        {
            const arrayBufferNewMatrix = gpuBufferNewMatrix.getMappedRange();
            new Uint32Array(arrayBufferNewMatrix).set(newMatrix);
        }
        gpuBufferNewMatrix.unmap();
        const commandEncoder = device.createCommandEncoder();

        commandEncoder.copyBufferToBuffer(
            gpuBufferNewMatrix /* source buffer */,
            0 /* source offset */,
            flipped ? gpuBufferFirstMatrix : resultMatrixBuffer /* destination buffer */,
            0 /* destination offset */,
            newMatrix.byteLength /* size */
        );

        device.queue.submit([commandEncoder.finish()]);
    };
    randomise_content();

    // Texture to store renders : float32x4
    const gpuStateTexture = device.createTexture({
        size: { width: width, height: height },
        format: renderFormat,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
    });
    const renderTextureView = gpuStateTexture.createView({});


    const computerShaderModule = device.createShaderModule({
        code: `
struct Dimensions {
size : vec2<u32>;
};

struct Matrix {
numbers: array<u32>;
};

struct Colours {
size: vec4<u32>;
colours: array<vec4<f32>>;
};

@group(0) @binding(0) var<storage,read> firstMatrix : Matrix;
@group(0) @binding(1) var<storage,write> resultMatrix : Matrix;
@group(0) @binding(2) var<storage,read> colours :  Colours;
@group(0) @binding(3) var texture : texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(4) var<storage,read> dimensions : Dimensions;

fn get_index(resultCell: vec2<u32>) -> u32 {
return resultCell.y + resultCell.x * dimensions.size.y;
}

fn get_with_offset(pos: vec2<u32>, dims: vec2<i32>, x: i32, y: i32) -> u32 {
let index : u32 = get_index(vec2<u32>(
    u32( (i32(pos.x) +  dims.x + x) % dims.x),
    u32( (i32(pos.y) +  dims.y + y) % dims.y)
));
return firstMatrix.numbers[index];
}


@stage(compute) @workgroup_size(1) fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
let texture_dimensions: vec2<i32> = textureDimensions(texture);
let resultCell : vec2<u32> = vec2<u32>(global_id.x, global_id.y);
let above :u32 = get_with_offset(resultCell, texture_dimensions, 0, 1);
let below :u32 = get_with_offset(resultCell, texture_dimensions, 0, -1);
let left :u32 = get_with_offset(resultCell, texture_dimensions, -1, 0);
let right :u32 = get_with_offset(resultCell, texture_dimensions, 1, 0);
let index : u32 = get_index(resultCell);
let current:u32 = firstMatrix.numbers[index];
let eaten_by:u32 = (current + u32(1)) % colours.size[0];
if (above == eaten_by || 
    below == eaten_by ||
    left == eaten_by ||
    right == eaten_by) {
        resultMatrix.numbers[index] = eaten_by;
    } else {
        resultMatrix.numbers[index] = current;
    }
}

@stage(compute) @workgroup_size(1) fn state_to_texture(@builtin(global_invocation_id) global_id : vec3<u32>) {
let resultCell : vec2<i32> = vec2<i32>(i32(global_id.x), i32(global_id.y));
let index : i32 = resultCell.y + resultCell.x * i32(dimensions.size.y);
let state: u32 = (u32(resultMatrix.numbers[index])  ) % colours.size.x;
let colour: vec4<f32> = colours.colours[state];
// let colour : vec4<f32> = vec4<f32>(f32(global_id.x), f32(global_id.y), f32((global_id.x+global_id.y))/2., 1.0);
textureStore(texture, resultCell, colour);
}

@stage(vertex)
fn vertex(@location(0) vertex: vec3<f32>  ) -> @builtin(position) vec4<f32> {
return vec4<f32>(vertex.x, vertex.y, vertex.z, 1.0);
}

@group(0) @binding(0) var read_texture : texture_2d<f32>;
@group(0) @binding(1) var texture_sampler : sampler;

@stage(fragment)
fn fragment(@builtin(position) coord_in: vec4<f32>) -> @location(0) vec4<f32> {
let texture_dimensions: vec2<i32> = textureDimensions(read_texture);
let coords :vec2<f32> = vec2<f32>(coord_in.x/f32(texture_dimensions.x), coord_in.y/f32(texture_dimensions.y));
return textureSample(read_texture, texture_sampler, coords);
}
`
    });

    const computePipeline = device.createComputePipeline({
        compute: {
            module: computerShaderModule,
            entryPoint: "main"
        }
    });

    /**
     * @param {GPUBuffer} b1
     * @param {GPUBuffer} b2
     */
    function makeEntries(b1, b2) {
        return [{
            binding: 0,
            resource: {
                buffer: b1
            }
        },
        {
            binding: 1,
            resource: {
                buffer: b2
            }
        },
        {
            binding: 2,
            resource: {
                buffer: gpuBufferColours
            }
        },
        {
            binding: 3,
            // visibility: GPUShaderStage.FRAGMENT
            // visibility: GPUShaderStageFlags.COMPUTE,
            resource: renderTextureView
        },
        {
            binding: 4,
            resource: { buffer: gpuDimensionsBuffer }
        }
        ]
    }
    const computeBindEntries1 = makeEntries(gpuBufferFirstMatrix, resultMatrixBuffer);
    const computeBindEntries2 = makeEntries(resultMatrixBuffer, gpuBufferFirstMatrix);

    // const computeLayout = computePipeline.getBindGroupLayout(0);
    // getBindGroupLayout reads the WGSL code @group value.
    // entries must match the entry points needs.
    var computeBindGroup1 = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        // layout: ComputeGPUBindGroupLayout,
        entries: computeBindEntries1
    });
    var computeBindGroup2 = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        // layout: ComputeGPUBindGroupLayout,
        entries: computeBindEntries2
    });


    /**
     * @param {GPUBuffer} b2
     */
    function makeToTextureEntries(b2) {
        return [
            {
                binding: 1,
                resource: {
                    buffer: b2
                }
            },
            {
                binding: 2,
                resource: {
                    buffer: gpuBufferColours
                }
            },
            {
                binding: 3,
                // visibility: GPUShaderStageFlags.COMPUTE,
                resource: renderTextureView
            },
            {
                binding: 4,
                resource: { buffer: gpuDimensionsBuffer }
            }
        ]
    }
    const toTextureBindEntries1 = makeToTextureEntries(resultMatrixBuffer);
    const toTextureBindEntries2 = makeToTextureEntries(gpuBufferFirstMatrix);

    const cellToTexturePipeline = device.createComputePipeline({
        compute: {
            module: computerShaderModule,
            entryPoint: "state_to_texture"
        }
    })
    const cellToTextureBindGroup1 = device.createBindGroup({
        layout: cellToTexturePipeline.getBindGroupLayout(0),
        entries: toTextureBindEntries1
    });
    const cellToTextureBindGroup2 = device.createBindGroup({
        layout: cellToTexturePipeline.getBindGroupLayout(0),
        entries: toTextureBindEntries2
    });

    const positionLocation = 0;
    const colorLocation = 1;

    /*
      y
      1 1   3
     -1 0   2
       -1   1 x
     */
    const vertexValues2 = [
        // x, y, z
        -1, -1, 0,
        -1, 1, 0,
        1, -1, 0,
        1, 1, 0,
    ];
    const vertexDataBufferDescriptor2 = {
        mappedAtCreation: true,
        size: 3 * 4 * 4, // 3 columns, 4 rows, f32 data type
        usage: GPUBufferUsage.VERTEX
    };
    const vertexBuffer2 = device.createBuffer(vertexDataBufferDescriptor2);
    const vertexBuffer2Array = vertexBuffer2.getMappedRange();
    new Float32Array(vertexBuffer2Array).set(vertexValues2);
    vertexBuffer2.unmap();

    /* Index Data */
    const indexValues = [
        // A, B, C
        0, 2, 1,
        2, 1, 3
    ];
    const indexDataBufferDescriptor = {
        mappedAtCreation: true,
        size: 2 * 3 * 2, // 2 triangles, 3 points each, u16 per point
        usage: GPUBufferUsage.INDEX
    };
    const indexBuffer = device.createBuffer(indexDataBufferDescriptor);
    const indexBufferArray = indexBuffer.getMappedRange();
    new Uint16Array(indexBufferArray).set(indexValues);
    indexBuffer.unmap();

    /* GPUVertexAttributeDescriptors */
    const positionAttribute = {
        shaderLocation: positionLocation,
        offset: 0,
        format: "float32x4"
    };
    const colorOffset = 4;
    const vertexStride = 4;
    const colorAttribute = {
        shaderLocation: colorLocation,
        offset: colorOffset,
        format: "float32x4"
    };

    /* GPUVertexBufferDescriptor */
    const vertexBufferDescriptor = {
        stride: vertexStride,
        attributeSet: [positionAttribute, colorAttribute]
    };

    /* GPUVertexInputDescriptor */
    const vertexInputDescriptor = {
        vertexBuffers: [vertexBufferDescriptor]
    };

    const copyBlendDescriptor = { srcFactor: "one", dstFactor: "zero", operation: "add" };

    // pass the vertex into the vertex shader:
    // -- start --
    const GPUVertexAttribute = {
        shaderLocation: 0, // [[location(0)]]
        offset: 0,
        format: 'float32x3'
    };
    const GPUVertexBufferLayout = {
        arrayStride: 4 * 3, // sizeof(vec3<f32>)
        stepMode: "vertex", // use the vertex index as input to the lookup
        attributes: [GPUVertexAttribute],
    };
    // -- end --
    const GPUVertexState = {
        module: computerShaderModule,
        entryPoint: "vertex",
        buffers: [GPUVertexBufferLayout]
    };
    const GPUBlendState = {
        color: copyBlendDescriptor,
        alpha: copyBlendDescriptor,
    };
    const GPUColorTargetState = {
        format: swapChainFormat,
        blend: GPUBlendState,
        writeMask: GPUColorWrite.ALL,
    };
    const GPUFragmentState = {
        module: computerShaderModule,
        entryPoint: "fragment",
        targets: [GPUColorTargetState],
    };

    // GPUTextureSampleType ... "unfilterable-float"
    const stateSampler = device.createSampler({

    });

    const GPURenderPipelineLayout = {};
    /* GPURenderPipelineDescriptor */
    const renderPipelineDescriptor = {
        vertex: GPUVertexState,
        fragment: GPUFragmentState,
        compute: {
            module: computerShaderModule,
            entryPoint: "main"
        }
    };
    /* GPURenderPipeline */
    // XXX: screen rendering disabled
    const renderPipeline = device.createRenderPipeline(renderPipelineDescriptor);
    const renderBindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: renderTextureView
            },
            {
                binding: 1,
                resource: stateSampler
            },
        ]
    });


    /* GPUTexture */

    /* GPUTextureView */
    // const renderAttachment = swapChainTexture.createDefaultView();

    /* GPUColor */
    const darkBlue = { r: 0.15, g: 0.15, b: 0.5, a: 1 };

    const GPUTextureViewDescriptor = {
        format: swapChainFormat,
    };
    /* GPURenderPassColorAttachment */

    // Get a GPU buffer for reading in an unmapped state.
    const gpuReadBuffer = device.createBuffer({
        size: (colours[0] + 1) * 16,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    // // Get a GPU buffer for debugging the automata as a texture
    const gpuTextureBuffer = device.createBuffer({
        size: width * width * 16,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });


    /*** Rendering ***/
    // Need to do a reset on the first time through
    var reset = true;
    var flipped = 0;
    const renderLoop = async () => {
        if (reset) {
            const states = parseFloat(rangeCtl.value) || 2;
            let old_states = (colours.length / 4) - 1;
            gpuBufferColours = set_states(colours, states);
            computeBindEntries1[2].resource.buffer = gpuBufferColours;
            computeBindEntries2[2].resource.buffer = gpuBufferColours;
            computeBindGroup1 = device.createBindGroup({
                label: `states: ${states}`,
                layout: computePipeline.getBindGroupLayout(0),
                entries: computeBindEntries1
            });
            computeBindGroup2 = device.createBindGroup({
                label: `states: ${states}`,
                layout: computePipeline.getBindGroupLayout(0),
                entries: computeBindEntries2
            });
            if (states > old_states) {
                randomise_content(flipped);
            }
            reset = false;
        }
        const swapChainTexture = gpuContext.getCurrentTexture();
        const GPUTextureView = swapChainTexture.createView(GPUTextureViewDescriptor);
        const colorAttachmentDescriptor = {
            view: GPUTextureView,
            // resolveTarget: GPUTextureViewTarget,
            loadOp: "clear",
            loadValue: darkBlue, // unneeded but non-canary doesn't have loadOp: clear yet?
            clearValue: darkBlue,
            storeOp: "store",
            // attachment: renderAttachment,
            // loadOp: "clear",
            // storeOp: "store",
            // clearColor: darkBlue
        };

        /* GPURenderPassDescriptor */
        const renderPassDescriptor = { colorAttachments: [colorAttachmentDescriptor] };

        const commandEncoder = device.createCommandEncoder();

        // Stage 1: cell updates: matrix 1 -> matrix 2
        {
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(computePipeline);
            passEncoder.setBindGroup(0, flipped ? computeBindGroup1 : computeBindGroup2);
            passEncoder.dispatch(width /* x */, height /* y */);
            passEncoder.endPass();
        }
        // Stage 2: convert cell matrix to texture format
        {
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(cellToTexturePipeline);
            passEncoder.setBindGroup(0, flipped ? cellToTextureBindGroup1 : cellToTextureBindGroup2);
            passEncoder.dispatch(width /* x */, height /* y */);
            passEncoder.endPass();
        }

        // Stage 3: render pass

        /* GPURenderPassEncoder */
        // XXX: screen rendering disabled
        const renderPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

        renderPassEncoder.setPipeline(renderPipeline);
        renderPassEncoder.setBindGroup(0, renderBindGroup);
        const indexBufferFormat = "uint16";
        renderPassEncoder.setIndexBuffer(indexBuffer, indexBufferFormat, 0);
        const vertexBufferSlot = 0;
        renderPassEncoder.setVertexBuffer(vertexBufferSlot, vertexBuffer2, 0);
        renderPassEncoder.drawIndexed(6); // 3 vertices
        renderPassEncoder.endPass();

        device.queue.submit([commandEncoder.finish()]);

        // Stage 4: flip buffers
        flipped = (flipped + 1) % 2;
        // console.log(flipped);
        requestAnimationFrame(renderLoop);
    };
    requestAnimationFrame(renderLoop);
    const loop_reset = function () {
        reset = true;
    };

    // Wire up events
    renderBtn.addEventListener('click', () => {
        loop_reset();
    });
    // rangeCtl.addEventListener('change', () => {

    //     loop_reset();
    // });


})();