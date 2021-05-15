import('./pkg')
    .then(wasm => {
        function set_states(loop, states) {
            loop.empty_states();
            let factor = 255.0 / states;
            for (let i = 0; i < states; i++) {
                loop.push_colour(new wasm.Colour(Math.round(i * factor), 0, 0, 255));
            }
        }
        const canvas = document.getElementById('drawing');
        const ctx = canvas.getContext('2d');
        const loop = new wasm.Loop(canvas);
        wasm.set_panic_hook();
        const renderLoop = () => {
            loop.tick();
            requestAnimationFrame(renderLoop);
        };
        loop.push_colour(new wasm.Colour(0, 0, 0, 255));
        loop.push_colour(new wasm.Colour(255, 0, 0, 255));
        loop.push_colour(new wasm.Colour(255, 255, 0, 255));
        loop.push_colour(new wasm.Colour(0, 255, 0, 255));
        loop.push_colour(new wasm.Colour(0, 255, 255, 255));
        loop.push_colour(new wasm.Colour(0, 0, 255, 255));
        loop.push_colour(new wasm.Colour(255, 0, 255, 255));
        loop.push_colour(new wasm.Colour(255, 255, 255, 255));
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
