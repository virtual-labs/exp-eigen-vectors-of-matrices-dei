### Theory

Eigenvalues and eigenvectors are fundamental concepts in linear algebra that help describe how a linear transformation affects geometric objects such as vectors and shapes. When a matrix transforms a vector, the result typically changes both its direction and magnitude. However, some special vectors maintain their direction even after transformation — these are called eigenvectors.

For a square matrix \( A \), if there exists a non-zero vector \( v \) such that the matrix multiplication results in a scaled version of the same vector:

A · v = λ · v

Then:
- \( v \) is called an **eigenvector**
- \( λ \) is called the corresponding **eigenvalue**

Eigenvalues indicate how much the eigenvector is scaled during the transformation. Each eigenvalue is associated with one or more eigenvectors that share this scaling behavior.

To find eigenvalues, we solve the **characteristic equation** obtained from the matrix:

det(A − λI) = 0

Once the eigenvalues are known, the eigenvectors are computed by substituting each eigenvalue back into the equation (A − λI)v = 0 and solving for v.

Eigenvalues and eigenvectors have important applications in many scientific and engineering fields:
- Principal Component Analysis (PCA) in data science
- Vibration modes in mechanical systems
- Stability analysis in control engineering
- Quantum mechanics
- Image compression and feature extraction

In this experiment, the matrix values are entered using interactive sliders. The system then automatically calculates eigenvalues and their corresponding eigenvectors, allowing for visualization and deeper understanding of how matrix transformations behave.
