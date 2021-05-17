use std::mem;

pub struct Simulation {
    pub height: u32,
    pub new_state: Vec<u8>,
    pub state: Vec<u8>,
    pub states: u8,
    pub width: u32,
}

impl Simulation {
    pub fn next_state(&mut self) {
        let state_length = self.state.len();
        let state_end = state_length - 1;
        let width = self.width as usize;
        let last_row = state_length - width;
        let mut new_state = mem::take(&mut self.new_state);
        let prev = |offset| -> u8 {
            if offset != 0 {
                self.state[offset - 1]
            } else {
                self.state[state_end]
            }
        };
        let next = |offset| -> u8 {
            if offset != state_end {
                self.state[offset + 1]
            } else {
                self.state[0]
            }
        };
        let above = |offset| -> u8 {
            if offset >= width {
                self.state[offset - width]
            } else {
                self.state[last_row + offset]
            }
        };
        let below = |offset| -> u8 {
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
                let eaten_by = (cell + 1) % self.states;
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

    #[inline]
    pub fn seed<R: Fn() -> f64>(&mut self, random: R) {
        for cell in self.state.iter_mut() {
            *cell = (random() * self.states as f64).floor() as u8;
        }
    }

    pub fn set_states(&mut self, states: u8) {
        self.states = states;
    }
}
