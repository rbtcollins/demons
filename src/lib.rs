mod utils;

use std::mem;

use js_sys::Math::random;
use wasm_bindgen::prelude::*;
use wasm_bindgen::Clamped;
use wasm_bindgen::JsCast;
// use web_sys::{console};
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, ImageData};

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
    ctx: CanvasRenderingContext2d,
    width: u32,
    height: u32,
    next: Vec<u8>,
    states: Vec<Colour>,
    initialised: bool,
    state: Vec<u8>,
    new_state: Vec<u8>,
}

impl Loop {
    fn next_state(&mut self) {
        let state_length = self.state.len();
        let state_end = state_length - 1;
        let width = self.width as usize;
        let last_row = state_length - width;
        let mut new_state = mem::take(&mut self.new_state);
        let prev = |offset| -> u8 {
            // console::log_1(&"a".into());
            if offset != 0 {
                self.state[offset - 1]
            } else {
                self.state[state_end]
            }
        };
        let next = |offset| -> u8 {
            // console::log_1(&"b".into());
            if offset != state_end {
                self.state[offset + 1]
            } else {
                self.state[0]
            }
        };
        let above = |offset| -> u8 {
            // console::log_1(&"c".into());
            if offset >= width {
                self.state[offset - width]
            } else {
                self.state[last_row + offset]
            }
        };
        let below = |offset| -> u8 {
            // console::log_1(&"d".into());
            if offset < last_row {
                self.state[offset + width]
            } else {
                self.state[offset - last_row]
            }
        };
        let mut offset = 0;
        for _x in 0..self.width {
            for _y in 0..self.height {
                let mut cell = self.state[offset];
                // Be eaten by the next state up
                let eaten_by = (cell + 1) % self.states.len() as u8;
                if prev(offset) == eaten_by
                    || next(offset) == eaten_by
                    || above(offset) == eaten_by
                    || below(offset) == eaten_by
                {
                    cell = eaten_by;
                }
                new_state[offset] = cell;
                offset += 1;
            }
        }
        self.new_state = new_state;
        mem::swap(&mut self.state, &mut self.new_state);
    }

    // fn num_states(&self) -> usize {
    //     self.states.len()
    // }

    fn seed_state(state: &mut Vec<u8>, width: u32, height: u32, states: u8) {
        let mut offset = 0;
        for _x in 0..width {
            for _y in 0..height {
                let cell = (random() * states as f64).floor() as u8;
                state[offset] = cell;
                offset += 1;
            }
        }
    }
}

#[wasm_bindgen]
impl Loop {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<Loop, JsValue> {
        let ctx = canvas
            .get_context("2d")?
            .unwrap()
            .dyn_into::<web_sys::CanvasRenderingContext2d>()?;
        let width = canvas.width();
        let height = canvas.height();
        let array_size = (width * height * 4) as usize;
        let mut state: Vec<u8> = Vec::new();
        state.resize((width * height) as usize, 0);
        let mut new_state: Vec<u8> = Vec::new();
        new_state.resize((width * height) as usize, 0);
        Ok(Loop {
            width,
            height,
            // canvas,
            ctx,
            next: vec![0; array_size],
            states: vec![],
            initialised: false,
            state,
            new_state,
        })
    }

    pub fn empty_states(&mut self) {
        self.states.clear();
    }

    pub fn push_colour(&mut self, colour: Colour) {
        self.states.push(colour);
    }

    pub fn tick(&mut self) -> Result<(), JsValue> {
        if !self.initialised {
            Loop::seed_state(
                &mut self.state,
                self.width,
                self.height,
                self.states.len() as u8,
            );
            self.initialised = true;
        } else {
            self.next_state();
        }
        let mut state_offset = 0;
        let mut img_offset = 0;
        for _x in 0..self.width {
            for _y in 0..self.height {
                let colour = &self.states[self.state[state_offset] as usize];
                state_offset += 1;
                self.next[img_offset] = colour.red;
                img_offset += 1;
                self.next[img_offset] = colour.green;
                img_offset += 1;
                self.next[img_offset] = colour.blue;
                img_offset += 1;
                self.next[img_offset] = colour.alpha;
                img_offset += 1;
            }
        }
        let context = &self.ctx;
        let image_data = ImageData::new_with_u8_clamped_array_and_sh(
            Clamped(&self.next),
            self.width,
            self.height,
        )?;
        context.put_image_data(&image_data, 0.0, 0.0)?;
        Ok(())
    }

    pub fn reset(&mut self) {
        Loop::seed_state(
            &mut self.state,
            self.width,
            self.height,
            self.states.len() as u8,
        );
    }
}
