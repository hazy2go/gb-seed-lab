// Test ROM for gb/fastmath.s (not part of seedlab.gb): computes batches of 32-bit products, quotients and
// remainders for operands from a shared xorshift, for tools/mathtest.py to check against Python.
#include <gb/gb.h>
#include <stdint.h>

#ifndef OPS
#define OPS 31
#endif
#define N 128
typedef struct { uint32_t a, b, mul, divu, modu; int32_t divs, mods; } rec_t;
volatile uint8_t mt_go, mt_done;
uint32_t mt_state;
rec_t mt_out[N];

static uint32_t xs(void) { uint32_t x = mt_state; x ^= x << 13; x ^= x >> 17; x ^= x << 5; mt_state = x; return x; }
// operand with a random byte length (0..4) and occasional edge values
static uint32_t operand(void) {
  static const uint32_t edge[] = { 0, 1, 2, 255, 256, 65535, 65536, 65537, 0x7FFFFFFFUL, 0x80000000UL, 0xFFFFFFFFUL, 0xFFFF0000UL, 0x00FFFFFFUL, 0x01000000UL };
  uint32_t r = xs(), k = r & 15;
  if (k < 2) return edge[(uint8_t)((uint8_t)(r >> 8) & 15) % 14];   // 8-bit maths only: the test must not use what it tests
  r = xs();
  switch (k & 3) { case 0: return r & 0xFF; case 1: return r & 0xFFFF; case 2: return r & 0xFFFFFF; default: return r; }
}

void main(void) {
  uint8_t i;
  for (;;) {
    while (!mt_go) ;
    mt_go = 0;
    for (i = 0; i < N; i++) {
      rec_t *o = &mt_out[i];
      uint32_t a = operand(), b = operand();
      if (b == 0) b = 7;
      if ((int32_t)b == -1 && a == 0x80000000UL) b = 3;   // INT_MIN / -1 is undefined in C
      o->a = a; o->b = b;
#if OPS & 1
      o->mul = a * b;
#endif
#if OPS & 2
      o->divu = a / b;
#endif
#if OPS & 4
      o->modu = a % b;
#endif
#if OPS & 8
      o->divs = (int32_t)a / (int32_t)b;
#endif
#if OPS & 16
      o->mods = (int32_t)a % (int32_t)b;
#endif
    }
    mt_done = 1;
  }
}
