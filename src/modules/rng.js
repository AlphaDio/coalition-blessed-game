/**
 * Deterministic random number generator using xorshift128+
 * Produces the same sequence of numbers given the same seed
 */
export class DeterministicRNG {
  constructor(seed = 123456789) {
    // Initialize with a simple hash of the seed to ensure good distribution
    this.state0 = seed;
    this.state1 = seed ^ 0x9E3779B9; // Golden ratio constant

    // Warm up the generator
    for (let i = 0; i < 20; i++) {
      this.next();
    }
  }

  /**
   * Generate next random number in sequence (0 to 2^32-1)
   */
  next() {
    let s1 = this.state0;
    const s0 = this.state1;
    this.state0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.state1 = s1;
    return (this.state0 + this.state1) >>> 0; // Convert to unsigned 32-bit
  }

  /**
   * Generate random float between 0 and 1 (exclusive of 1)
   */
  random() {
    return this.next() / 0x100000000; // Divide by 2^32
  }

  /**
   * Generate random integer between min (inclusive) and max (exclusive)
   */
  randomInt(min, max) {
    return Math.floor(this.random() * (max - min)) + min;
  }

  /**
   * Generate random float between min (inclusive) and max (exclusive)
   */
  randomFloat(min, max) {
    return this.random() * (max - min) + min;
  }

  /**
   * Pick a random element from an array
   */
  choice(array) {
    return array[this.randomInt(0, array.length)];
  }

  /**
   * Shuffle an array in place using Fisher-Yates algorithm
   */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Create a new RNG instance with the same seed (for debugging/reproducibility)
   */
  clone() {
    const rng = new DeterministicRNG(0); // Don't warm up
    rng.state0 = this.state0;
    rng.state1 = this.state1;
    return rng;
  }

  /**
   * Get current state for serialization
   */
  getState() {
    return { state0: this.state0, state1: this.state1 };
  }

  /**
   * Set state for deserialization
   */
  setState(state) {
    this.state0 = state.state0;
    this.state1 = state.state1;
  }
}
