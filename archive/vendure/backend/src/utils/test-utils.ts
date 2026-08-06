/**
 * Test Utilities
 *
 * Simple utility functions for testing coverage generation.
 */

export class TestUtils {
  /**
   * Simple string utility
   */
  static capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Simple math utility
   */
  static add(a: number, b: number): number {
    return a + b;
  }

  /**
   * Simple array utility
   */
  static filterEven(numbers: number[]): number[] {
    return numbers.filter(n => n % 2 === 0);
  }

  /**
   * Simple object utility
   */
  static createUser(name: string, age: number): { name: string; age: number; id: string } {
    return {
      name,
      age,
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  /**
   * Simple async utility
   */
  static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simple validation utility
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
