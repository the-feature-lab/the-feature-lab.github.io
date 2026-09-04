---
title: "Useful math tricks in learning mechanics"
description: "The workhorse mathematical tools, tricks, and techniques we reach for most often in learning mechanics — enumerated and organized, with illustrative papers."
author: "FLAB"
date: "2026-09-04"
---

Every math-heavy discipline of science grows to rely on a cultivated toolbox of particularly useful math tricks and techniques. This is certainly true in [learning mechanics](https://learningmechanics.pub), the physicsy approach to fundamental science of deep learning that we do in FLAB.

It's useful to sit down once in a while and enumerate the workhorse tools. Doing so is like organizing your toolbox: it's nice to give some structure to your tools, and it's illuminating to see which ones you use often and which you don't. (Having your techniques organized is also very useful when it comes time to teach young folks, which is largely why we're putting it up publicly like this. If you're an aspiring learning mechanic, these are more or less the tools to learn!)

We hold a Learning Wednesday every week where we gather and jointly learn about or work through some topic, and so we sat down last week and sorted through our toolbox. What follows is our list of most-used math tools, tricks, and techniques, organized into coarse categories. The goal here is to enumerate these things, not to teach how to use them — we'll mostly just name things here for the sake of brevity, leaving the reader to learn things on his or her own — but we'll give some motivation for each and offer some papers from us or colleagues which use some of the tools at hand.

## Tools for linear systems

These are tools to try when you notice you have a *linear system.* There are lots of senses in which a system can be linear, but the hallmark is that a linear system is one in which *solutions superimpose:* if $f_1(x)$ and $f_2(x)$ are solutions, then so is $g(x) := f_1(x) + f_2(x)$.

This superposition behavior shows up in lots of contexts. In a surprising number of cases, you can usefully cast a system under study as a linear operator on some space. To give two examples:

- In linear (and kernel) regression, the predicted function $\hat{f}(\cdot)$ is a linear function of the true target function $f_*(\cdot)$. (See e.g. [Simon et al. (2021)](https://arxiv.org/abs/2110.03922).)
- Most systems (incl deep learning systems) given a small perturbation can be reasonably approximated to first order (see the next section), in which case you get a matrix of stimulus-response partial derivatives (i.e. a Jacobian) as the main object of study, and this Jacobian is a linear operator. (In a deep sense, this is the entire neural tangent kernel story.)

Tools for linear systems include:

### Eigeneverything

If you have a square matrix, ask about its eigensystem. If you have a rectangular matrix, take its SVD. If you have a linear operator acting on some space, find its eigenfunctions and eigenvalues with respect to the relevant distribution. We've gotten a ridiculous amount of mileage out of doing this.

::: callout Illustrative papers
- [Saxe et al. (2013)](https://arxiv.org/abs/1312.6120) on deep linear nets,
- [Cohen et al. (2021)](https://arxiv.org/abs/2103.00065) on Hessian eigenvalues,
- [Simon et al. (2021)](https://arxiv.org/abs/2110.03922) on kernel eigensystems.
:::

### Fourier everything

If you're working in a symmetric domain (e.g., your data's drawn from a sphere), an eigendecomposition is often just a Fourier decomposition. On a line or torus, write things in terms of plane waves $e^{i k x}$ and then use all the related mathematical tricks that physicists know and love. On a sphere, write things in terms of spherical harmonics. It's often pretty nice to do this!

::: callout Illustrative papers
- [Mei and Montanari (2019)](https://arxiv.org/abs/1908.05355), in which kernel eigenmodes are spherical harmonics,
- [Kunin et al. (2025)](https://arxiv.org/abs/2506.06489) and [Marchetti et al. (2026)](https://arxiv.org/abs/2602.03655), which decompose the learning dynamics of modular addition in terms of Fourier modes,
- [Simon (2024)](https://jamiesimon.io/blog/1nn-eigenframework/), which solves for the test error of 1NN on the torus (blogpost, not paper).
:::

### Linear algebra identities

We also get huge mileage out of basic linear algebra identities: the cyclic trace property, the Sherman-Morrison formula, the Schur complement, matrix exponentials, eigenvalue interlacing formulae, properties of the determinant, properties of Kronecker factorization, and so on. There are also a bunch of useful facts like

$$
\mathbf{A} \left(\mathbf{A}^\top \mathbf{A} + \delta \mathbf{I} \right)^{-1} \mathbf{A}^\top = \left(\mathbf{A} \mathbf{A}^\top + \delta \mathbf{I} \right)^{-1} \mathbf{A} \mathbf{A}^\top
$$

that allow you to exchange a matrix and its transpose. A good trick for deriving (and remembering) these is to always try to SVD the matrix at hand. The [pseudoinverse](https://en.wikipedia.org/wiki/Moore%E2%80%93Penrose_inverse) is also a very useful tool that can let you handle over- and under-parameterized problems with a single notation without writing out cases, and this too is best understood in terms of the SVD. Besides the SVD, you should also know your other [classic matrix factorizations:](https://en.wikipedia.org/wiki/Matrix_decomposition) LU, QR, polar, and friends.

::: callout Illustrative papers and a reference book
We've used basic linear algebra identities in essentially every paper we've written! For just two examples, see

- [Simon et al. (2023)](https://arxiv.org/abs/2303.15438), for which the QR decomposition was the right tool for understanding dynamics from random initialization,
- [Karkada et al. (2026)](https://arxiv.org/abs/2602.15029), which used a Kronecker-factorizable model of analogies in natural language.

Petersen and Pedersen's [Matrix Cookbook](https://www.math.uwaterloo.ca/~hwolkowi/matrixcookbook.pdf) is a great bible for linear-algebraic identities (and for the matrix derivatives discussed below).
:::

### Matrix calculus

Matrix ODEs show up often, and you should know how to solve the classic ones, including linear ODEs with exponential dynamics. Derivative identities are also often useful. For example:

$$
\frac{d \ [\mathbf{A}^{-1}]_{ij}}{d \ A_{k \ell}} = -[\mathbf{A}^{-1}]_{ik} [\mathbf{A}^{-1}]_{\ell j}.
$$

Derivatives of matrix expressions can't always be written out in closed form like this, but it's useful to know the cases that can, and why they can, so you can spot em in the wild.

::: callout Illustrative papers
[Simon et al. (2021)](https://arxiv.org/abs/2110.03922) and [Simon et al. (2023)](https://arxiv.org/abs/2311.14646), which use matrix derivatives in deriving the central eigenframeworks.
:::

### Gram-Schmidt

The Gram-Schmidt process takes in a sequence of arbitrary vectors (or functions, or general elements of an inner-product space) and returns an orthonormalized version of that sequence. Often this is just a numerical convenience, but sometimes it's actually the right conceptual way to understand system dynamics.

::: callout Illustrative paper
in [Karkada et al. (2025)](https://arxiv.org/abs/2510.14878), we found that kernel eigensystems w.r.t. real data distributions can be very well predicted by a Gram-Schmidt process.
:::

### Kernels generally

It's often useful to construct a kernel function out of a multidimensional nonlinear map. If life gives you a map $\vx \mapsto \vphi(\vx)$, make the kernel function $K(\vx, \vx') := \langle \vphi(\vx), \vphi(\vx') \rangle$. Then apply all the above tricks and techniques and see if any work.

## Approximation

- discrete ↔ continuous
- Taylor series
- perturbation theory

## Scaling arguments + limits

- aggressive use of limits
- dimensional analysis
- hyperparameter scaling arguments
- powerlaws go here?

## Dynamical systems

- separation of timescales
- handful of simple ODEs
- random walks
- symmetries and conserved quantities

## Tools for and involving Gaussians

- Gaussian universality
- Gaussian integrals
- Wick's/Isserlis' thm

## Random matrix theory

## Notation + bookkeeping

- einstein notation
- Penrose notation for tensors

## Tools we mostly don't use

- info theory
- most geometry
- most group theory + algebra
- most Bayesian stuff
- exception: a few concepts
- most bounds + inequalities

---

*Thanks to Keon Abedi for contributions to the list.*
