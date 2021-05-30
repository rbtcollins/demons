use criterion::{black_box, criterion_group, criterion_main, Criterion};
use rand::Rng;

use demons::Simulation;

fn criterion_benchmark(c: &mut Criterion) {
    c.bench_function("seed", |b| {
        let mut s = Simulation {
            height: 2000,
            width: 2000,
            states: 30,
            state: vec![0; 2000 * 2000],
            new_state: vec![0; 2000 * 2000],
        };

        b.iter(move || {
            s.seed(|| {
                let mut rng = rand::thread_rng();
                rng.gen::<f64>()
            })
        })
    });
    c.bench_function("next_state", |b| {
        let mut s = Simulation {
            height: 2000,
            width: 3600,
            states: 30,
            state: vec![0; 3600 * 2000],
            new_state: vec![0; 3600 * 2000],
        };
        s.seed(|| {
            let mut rng = rand::thread_rng();
            rng.gen::<f64>()
        });

        b.iter(|| s.next_state())
    });
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);
