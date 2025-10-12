# Graphiti Function Reference

This reference lists all valid mathematical functions available in Graphiti, organized by frequency of use.

## Most Frequently Used Functions

### Basic Arithmetic
```javascript
x + 1           // Addition
x - 2           // Subtraction  
2x              // Multiplication (implicit)
2 * x           // Multiplication (explicit)
x / 3           // Division
x^2             // Exponentiation
x^(1/2)         // Fractional exponents
```

### Common Functions
```javascript
sin(x)          // Sine
cos(x)          // Cosine
tan(x)          // Tangent
log(x)          // Natural logarithm (ln)
sqrt(x)         // Square root
abs(x)          // Absolute value
exp(x)          // Exponential (e^x)
```

### Constants
```javascript
pi              // π (3.14159...)
e               // Euler's number (2.71828...)
```

## Trigonometric Functions

### Basic Trigonometry
```javascript
sin(x)          // Sine
cos(x)          // Cosine
tan(x)          // Tangent
sec(x)          // Secant
csc(x)          // Cosecant
cot(x)          // Cotangent
```

### Inverse Trigonometry
```javascript
asin(x)         // Arcsine
acos(x)         // Arccosine
atan(x)         // Arctangent
asec(x)         // Arcsecant
acsc(x)         // Arccosecant
acot(x)         // Arccotangent
```

### Hyperbolic Functions
```javascript
sinh(x)         // Hyperbolic sine
cosh(x)         // Hyperbolic cosine
tanh(x)         // Hyperbolic tangent
sech(x)         // Hyperbolic secant
csch(x)         // Hyperbolic cosecant
coth(x)         // Hyperbolic cotangent
```

### Inverse Hyperbolic Functions
```javascript
asinh(x)        // Inverse hyperbolic sine
acosh(x)        // Inverse hyperbolic cosine
atanh(x)        // Inverse hyperbolic tangent
asech(x)        // Inverse hyperbolic secant
acsch(x)        // Inverse hyperbolic cosecant
acoth(x)        // Inverse hyperbolic cotangent
```

## Logarithmic and Exponential Functions

```javascript
log(x)          // Natural logarithm (base e)
log10(x)        // Base-10 logarithm
log2(x)         // Base-2 logarithm
exp(x)          // e^x
exp10(x)        // 10^x
exp2(x)         // 2^x
pow(x, y)       // x^y (alternative to x^y)
```

## Algebraic Functions

### Roots and Powers
```javascript
sqrt(x)         // Square root
cbrt(x)         // Cube root
nthRoot(x, n)   // nth root
square(x)       // x^2
cube(x)         // x^3
```

### Utility Functions
```javascript
abs(x)          // Absolute value
sign(x)         // Sign function (-1, 0, or 1)
floor(x)        // Floor function
ceil(x)         // Ceiling function
round(x)        // Round to nearest integer
fix(x)          // Round towards zero
```

## Special Functions

### Factorials and Combinations
```javascript
factorial(n)    // n! (for integers)
gamma(x)        // Gamma function
```

### Step and Piecewise Functions
```javascript
step(x)         // Unit step function
```

## Function Composition Examples

### Transformations
```javascript
sin(2x + pi)    // Frequency and phase shift
2 sin(x)        // Amplitude scaling
sin(x) + 1      // Vertical shift
abs(sin(x))     // Absolute value of sine
```

### Combinations
```javascript
sin(x) cos(x)   // Product of functions
sin(x) + cos(x) // Sum of functions
e^(-x) sin(x)   // Damped oscillation
log(abs(x))     // Logarithm of absolute value
```

### Complex Expressions
```javascript
e^(-x^2/2)      // Gaussian function
x sin(1/x)      // Function with singularity
ln(1 + x^2)     // Logarithm of polynomial
sqrt(1 - x^2)   // Semi-circle
```

## Usage Notes

### Angle Modes
- **Radians**: Default mode for trigonometric functions
- **Degrees**: Toggle with DEG/RAD button
- Use `sin(pi x)` for cleaner period expressions

### Function Syntax
- **Implicit multiplication**: `2x`, `pi x`, `sin(x) cos(x)`
- **Explicit multiplication**: `2 * x`, `pi * x`
- **Parentheses**: Required for function arguments `sin(x)`, not `sin x`
- **Exponentiation**: Use `^` operator, e.g., `x^2`, `e^(-x)`

### Domain Considerations
- `log(x)`: Defined for x > 0
- `sqrt(x)`: Defined for x ≥ 0
- `asin(x)`, `acos(x)`: Defined for -1 ≤ x ≤ 1
- `tan(x)`: Undefined at odd multiples of π/2

### Common Patterns
```javascript
// Periodic functions
sin(2 pi x)     // Period of 1
cos(pi x / 2)   // Period of 4

// Growth and decay
e^x             // Exponential growth
e^(-x)          // Exponential decay
x^2             // Quadratic growth
1/x             // Inverse relationship

// Wave functions
sin(x) cos(x)   // Beat pattern
A sin(B x + C)  // General sinusoid
```

## Error Handling

Functions will display errors for:
- Division by zero: `1/0`
- Invalid domains: `log(-1)`, `sqrt(-1)`
- Undefined values: `tan(pi/2)`
- Syntax errors: Missing parentheses, invalid operators

## Tips for Best Results

1. **Use parentheses** liberally to ensure correct order of operations
2. **Test simple cases** first before building complex expressions
3. **Use the trace feature** to explore function behavior
4. **Check domains** for functions like log, sqrt, and inverse trig
5. **Zoom appropriately** to see the full behavior of your function