mod simulation;
mod utils;

use std::convert::TryInto;

use js_sys::Math::random;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
// use web_sys::{console};
use web_sys::{
    HtmlCanvasElement, WebGlBuffer, WebGlProgram, WebGlRenderingContext, WebGlShader, WebGlTexture,
};

pub use simulation::*;
pub use utils::*;

#[wasm_bindgen]
pub struct Colour {
    red: u8,
    green: u8,
    blue: u8,
    alpha: u8,
}

#[wasm_bindgen]
impl Colour {
    #[wasm_bindgen(constructor)]
    pub fn new(red: u8, green: u8, blue: u8, alpha: u8) -> Colour {
        Colour {
            red,
            green,
            blue,
            alpha,
        }
    }
}

#[wasm_bindgen]
pub struct Loop {
    // canvas: HtmlCanvasElement,
    gl_ctx: WebGlRenderingContext,
    gl_texture: WebGlTexture,
    gl_program: WebGlProgram,
    vertex_buffer: WebGlBuffer,
    texture_coord_buffer: WebGlBuffer,
    triangles_buffer: WebGlBuffer,
    next: Vec<u8>,
    states: Vec<Colour>,
    initialised: bool,
    vertex_attribute_index: u32,
    texture_coord_index: u32,
    simulation: Simulation,
}

impl Loop {
    fn compile_program(gl_ctx: &WebGlRenderingContext) -> Result<WebGlProgram, JsValue> {
        let vert_shader = Loop::compile_shader(
            gl_ctx,
            WebGlRenderingContext::VERTEX_SHADER,
            r#"
            attribute vec4 position;
            attribute vec2 a_texcoord;

            varying vec2 vTextureCoord;

            void main() {
                gl_Position = position;
                vTextureCoord = a_texcoord;
            }
        "#,
        )?;

        let frag_shader = Loop::compile_shader(
            gl_ctx,
            WebGlRenderingContext::FRAGMENT_SHADER,
            r#"
            varying highp vec2 vTextureCoord;
            
            uniform sampler2D uSampler;

            void main(void) {
                highp vec4 texelColor = texture2D(uSampler, vTextureCoord);

                gl_FragColor = vec4(texelColor.rgb, 1.0);//texelColor.a);
            }
        "#,
        )?;

        let gl_program = Loop::link_program(gl_ctx, &vert_shader, &frag_shader)?;
        Ok(gl_program)
    }

    pub fn compile_shader(
        gl_ctx: &WebGlRenderingContext,
        shader_type: u32,
        source: &str,
    ) -> Result<WebGlShader, String> {
        let shader = gl_ctx
            .create_shader(shader_type)
            .ok_or_else(|| String::from("Unable to create shader object"))?;
        gl_ctx.shader_source(&shader, source);
        gl_ctx.compile_shader(&shader);

        if gl_ctx
            .get_shader_parameter(&shader, WebGlRenderingContext::COMPILE_STATUS)
            .as_bool()
            .unwrap_or(false)
        {
            Ok(shader)
        } else {
            Err(gl_ctx
                .get_shader_info_log(&shader)
                .unwrap_or_else(|| String::from("Unknown error creating shader")))
        }
    }

    pub fn link_program(
        gl_ctx: &WebGlRenderingContext,
        vert_shader: &WebGlShader,
        frag_shader: &WebGlShader,
    ) -> Result<WebGlProgram, String> {
        let program = gl_ctx
            .create_program()
            .ok_or_else(|| String::from("Unable to create shader object"))?;

        gl_ctx.attach_shader(&program, vert_shader);
        gl_ctx.attach_shader(&program, frag_shader);
        gl_ctx.link_program(&program);

        if gl_ctx
            .get_program_parameter(&program, WebGlRenderingContext::LINK_STATUS)
            .as_bool()
            .unwrap_or(false)
        {
            Ok(program)
        } else {
            Err(gl_ctx
                .get_program_info_log(&program)
                .unwrap_or_else(|| String::from("Unknown error creating program object")))
        }
    }

    fn next_state(&mut self) {
        self.simulation.next_state();
    }

    // fn num_states(&self) -> usize {
    //     self.states.len()
    // }

    fn init_array_f32_buffer(
        gl_ctx: &WebGlRenderingContext,
        vertices: &Vec<f32>,
    ) -> Result<WebGlBuffer, JsValue> {
        let buffer = gl_ctx.create_buffer().ok_or("failed to create buffer")?;
        gl_ctx.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&buffer));

        // Note that `Float32Array::view` is somewhat dangerous (hence the
        // `unsafe`!). This is creating a raw view into our module's
        // `WebAssembly.Memory` buffer, but if we allocate more pages for ourself
        // (aka do a memory allocation in Rust) it'll cause the buffer to change,
        // causing the `Float32Array` to be invalid.
        //
        // As a result, after `Float32Array::view` we have to be very careful not to
        // do any memory allocations before it's dropped.
        unsafe {
            let array = js_sys::Float32Array::view(&vertices);

            gl_ctx.buffer_data_with_array_buffer_view(
                WebGlRenderingContext::ARRAY_BUFFER,
                &array,
                WebGlRenderingContext::STATIC_DRAW,
            );
        }
        Ok(buffer)
    }

    fn init_element_array_u16_buffer(
        gl_ctx: &WebGlRenderingContext,
        data: &[u16],
    ) -> Result<WebGlBuffer, JsValue> {
        let buffer = gl_ctx.create_buffer().ok_or("failed to create buffer")?;
        gl_ctx.bind_buffer(WebGlRenderingContext::ELEMENT_ARRAY_BUFFER, Some(&buffer));

        unsafe {
            let view = js_sys::Uint16Array::view(&data);

            gl_ctx.buffer_data_with_array_buffer_view(
                WebGlRenderingContext::ELEMENT_ARRAY_BUFFER,
                &view,
                WebGlRenderingContext::STATIC_DRAW,
            );
        }
        Ok(buffer)
    }
}

#[wasm_bindgen]
impl Loop {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<Loop, JsValue> {
        let gl_ctx = canvas
            .get_context("webgl")?
            .unwrap()
            .dyn_into::<WebGlRenderingContext>()?;
        let gl_texture = gl_ctx
            .create_texture()
            .ok_or_else(|| String::from("Unable to create texture object"))?;
        let width = canvas.width();
        let height = canvas.height();
        let array_size = (width * height * 4) as usize;
        let mut state: Vec<u8> = Vec::new();
        state.resize((width * height) as usize, 0);
        let mut new_state: Vec<u8> = Vec::new();
        new_state.resize((width * height) as usize, 0);

        let gl_program = Loop::compile_program(&gl_ctx)?;
        // gl space vertex locations
        let vertices: Vec<f32> = vec![
            -1.0, -1.0, 0.0, // left bottom
            -1.0, 1.0, 0.0, // left top
            1.0, -1.0, 0.0, // right bottom
            1.0, 1.0, 0.0, // right top
        ];
        let texture_coords: Vec<f32> = vec![
            0.0, 0.0, // left bottom
            0.0, 1.0, // left top
            1.0, 0.0, // right bottom
            1.0, 1.0, // right top
        ];
        // triangle definitions
        let triangles: [u16; 6] = [
            0, 1, 2, // clockwise
            2, 1, 3, // clockwise
        ];

        let vertex_buffer = Loop::init_array_f32_buffer(&gl_ctx, &vertices)?;
        let texture_coord_buffer = Loop::init_array_f32_buffer(&gl_ctx, &texture_coords)?;
        let triangles_buffer = Loop::init_element_array_u16_buffer(&gl_ctx, &triangles)?;

        let vertex_attribute_index = gl_ctx.get_attrib_location(&gl_program, "position") as u32;
        let texture_coord_index = gl_ctx.get_attrib_location(&gl_program, "a_texcoord") as u32;

        let simulation = Simulation {
            height,
            new_state,
            state,
            states: 0,
            width,
        };

        Ok(Loop {
            gl_ctx,
            gl_program,
            gl_texture,
            initialised: false,
            next: vec![0; array_size],
            simulation,
            states: vec![],
            texture_coord_buffer,
            texture_coord_index,
            triangles_buffer,
            vertex_attribute_index,
            vertex_buffer,
        })
    }

    pub fn empty_states(&mut self) {
        self.states.clear();
        self.simulation
            .set_states(self.states.len().try_into().expect("too many colours"));
    }

    pub fn push_colour(&mut self, colour: Colour) {
        self.states.push(colour);
        self.simulation
            .set_states(self.states.len().try_into().expect("too many colours"));
    }

    pub fn tick(&mut self) -> Result<(), JsValue> {
        if !self.initialised {
            self.simulation.seed(random);
            self.initialised = true;
        } else {
            self.next_state();
        }

        let states_iter = self.simulation.state.iter();
        let texture_iter = self.next.chunks_exact_mut(4);
        let zipped = states_iter.zip(texture_iter);
        for (state, chunk) in zipped {
            let colour = &self.states[*state as usize];
            chunk[0] = colour.red;
            chunk[1] = colour.green;
            chunk[2] = colour.blue;
            chunk[3] = colour.alpha;
        }

        // copy texture content into GL memory
        self.gl_ctx.use_program(Some(&self.gl_program));
        // -- start --
        {
            self.gl_ctx
                .bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&self.gl_texture));
            unsafe {
                let pixel_array = js_sys::Uint8Array::view(&self.next);

                self.gl_ctx.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_array_buffer_view(
                    WebGlRenderingContext::TEXTURE_2D,
                    0,
                    WebGlRenderingContext::RGBA as i32,
                    self.simulation.width as i32, self.simulation.height as i32, 0,
                    WebGlRenderingContext::RGBA, WebGlRenderingContext::UNSIGNED_BYTE, Some(&pixel_array)
                 )?;
                self.gl_ctx.tex_parameteri(
                    WebGlRenderingContext::TEXTURE_2D,
                    WebGlRenderingContext::TEXTURE_WRAP_S,
                    WebGlRenderingContext::CLAMP_TO_EDGE as i32,
                );
                self.gl_ctx.tex_parameteri(
                    WebGlRenderingContext::TEXTURE_2D,
                    WebGlRenderingContext::TEXTURE_WRAP_T,
                    WebGlRenderingContext::CLAMP_TO_EDGE as i32,
                );
                self.gl_ctx.tex_parameteri(
                    WebGlRenderingContext::TEXTURE_2D,
                    WebGlRenderingContext::TEXTURE_MIN_FILTER,
                    WebGlRenderingContext::LINEAR as i32,
                );
            }

            // -- end --
        }

        // set memory locations for parameters:
        // vertex locations
        self.gl_ctx.bind_buffer(
            WebGlRenderingContext::ARRAY_BUFFER,
            Some(&self.vertex_buffer),
        );
        self.gl_ctx.vertex_attrib_pointer_with_i32(
            self.vertex_attribute_index,
            3,
            WebGlRenderingContext::FLOAT,
            false,
            0,
            0,
        );
        self.gl_ctx
            .enable_vertex_attrib_array(self.vertex_attribute_index);
        // texture mapping locations
        self.gl_ctx.bind_buffer(
            WebGlRenderingContext::ARRAY_BUFFER,
            Some(&self.texture_coord_buffer),
        );
        self.gl_ctx.vertex_attrib_pointer_with_i32(
            self.texture_coord_index,
            2,
            WebGlRenderingContext::FLOAT,
            false,
            0,
            0,
        );
        self.gl_ctx
            .enable_vertex_attrib_array(self.texture_coord_index);
        // enable element array
        self.gl_ctx.bind_buffer(
            WebGlRenderingContext::ELEMENT_ARRAY_BUFFER,
            Some(&self.triangles_buffer),
        );

        // black background
        self.gl_ctx.clear_color(0.5, 0.5, 0.5, 1.0);
        self.gl_ctx.clear(WebGlRenderingContext::COLOR_BUFFER_BIT);

        // draw rectangle
        self.gl_ctx.draw_elements_with_i32(
            WebGlRenderingContext::TRIANGLES,
            6,
            WebGlRenderingContext::UNSIGNED_SHORT,
            0,
        );
        Ok(())
    }

    pub fn reset(&mut self) {
        self.simulation.seed(random);
    }
}
