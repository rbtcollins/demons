import('./pkg')
    .then(wasm => {
        function set_states(loop, states) {
            loop.empty_states();
            if (states <= 8) {
                loop.push_colour(new wasm.Colour(0, 0, 0, 255));
                if (states == 1) { return; }
                loop.push_colour(new wasm.Colour(255, 0, 0, 255));
                if (states == 2) { return; }
                loop.push_colour(new wasm.Colour(255, 255, 0, 255));
                if (states == 3) { return; }
                loop.push_colour(new wasm.Colour(0, 255, 0, 255));
                if (states == 4) { return; }
                loop.push_colour(new wasm.Colour(0, 255, 255, 255));
                if (states == 5) { return; }
                loop.push_colour(new wasm.Colour(0, 0, 255, 255));
                if (states == 6) { return; }
                loop.push_colour(new wasm.Colour(255, 0, 255, 255));
                if (states == 7) { return; }
                loop.push_colour(new wasm.Colour(255, 255, 255, 255));
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
                        loop.push_colour(new wasm.Colour(a_r + b_r * step, a_g + b_g * step, a_b + b_b * step, 255));
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

        }
        const canvas = document.getElementById('drawing');
        const loop = new wasm.Loop(canvas);
        wasm.set_panic_hook();
        const renderLoop = () => {
            loop.tick();
            requestAnimationFrame(renderLoop);
        };
        set_states(loop, 8);
        requestAnimationFrame(renderLoop);

        const renderBtn = document.getElementById('render');
        const rangeCtl = document.getElementById('states');

        renderBtn.addEventListener('click', () => {
            loop.reset();
        });
        rangeCtl.addEventListener('change', () => {
            const states = parseFloat(rangeCtl.value) || 2;
            set_states(loop, states);
            loop.reset();
        });
    })
    .catch(console.error);
