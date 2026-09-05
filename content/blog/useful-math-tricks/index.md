---
title: "Useful math tricks in learning mechanics"
description: "Workhorse math tools, tricks, and techniques in our research, categorized, with illustrative papers."
author: "FLAB"
date: "2026-09-04"
notes: "tooltip"
---

Every math-heavy discipline of science grows to rely on a cultivated toolbox of particularly useful math tricks and techniques. This is certainly true in [learning mechanics](https://learningmechanics.pub), the physicsy approach to fundamental science of deep learning that we take in FLAB.

It's useful to sit down once in a while and enumerate the workhorse tools. Doing so is like organizing your toolbox: it's nice to give some structure to your tools, and it's illuminating to see which ones you use often and which you don't. (Having your techniques organized is also very useful when it comes time to teach young folks, which is largely why we're putting it up publicly like this. If you're an aspiring learning mechanic, these are more or less the tools to learn!)

We hold a Learning Wednesday every week where we gather and jointly learn about or work through some topic, and so we sat down last week and sorted through our toolbox. What follows is our list of most-used math tools, tricks, and techniques, organized into coarse categories. The goal here is to enumerate these things, not to teach how to use them — we'll mostly just name things here for the sake of brevity, leaving the reader to learn things on their own — but we'll give some motivation for each and offer some papers from us or colleagues which use some of the tools at hand.

## Tools for linear systems

These are tools to try when you notice you have a *linear system.* There are lots of senses in which a system can be linear, but the hallmark is that a linear system is one in which *solutions superimpose:* if $f_1(x)$ and $f_2(x)$ are solutions, then so is $g(x) := f_1(x) + f_2(x)$.

This superposition behavior shows up in lots of contexts. In a surprising number of cases, you can usefully cast a system under study as a linear operator on some space. To give two examples:

- In linear (and kernel) regression, the predicted function $\hat{f}(\cdot)$ is a linear function of the true target function $f_*(\cdot)$. (See e.g. [Simon et al. (2021)](https://arxiv.org/abs/2110.03922).)
- Most systems (including deep learning systems) given a small perturbation can be reasonably approximated to first order (see the next section), in which case you get a matrix of stimulus-response partial derivatives (i.e. a Jacobian) as the main object of study, and this Jacobian is a linear operator. (In a deep sense, this is the entire neural tangent kernel story.)

Tools for linear systems include:

### Eigeneverything

If you have a square matrix, ask about its eigensystem, and its SVD if it's asymmetric. If you have a rectangular matrix, take its SVD. If you have a linear operator acting on some space, find its eigenfunctions and eigenvalues with respect to the relevant distribution. We've gotten a ridiculous amount of mileage out of doing this.

::: callout Illustrative papers
- [Saxe et al. (2013)](https://arxiv.org/abs/1312.6120) on deep linear nets;
- [Cohen et al. (2021)](https://arxiv.org/abs/2103.00065) on Hessian eigenvalues;
- [Simon et al. (2021)](https://arxiv.org/abs/2110.03922) on kernel eigensystems.
:::

### Fourier everything

If you're working in a symmetric domain (e.g., your data's drawn from a sphere), an eigendecomposition is often just a Fourier decomposition. On a line or torus, write things in terms of plane waves $e^{i k x}$ and then use all the related mathematical tricks that physicists know and love. On a sphere, write things in terms of spherical harmonics. It's often pretty nice to do this!

::: callout Illustrative papers
- [Mei and Montanari (2019)](https://arxiv.org/abs/1908.05355), in which kernel eigenmodes are spherical harmonics;
- [Kunin et al. (2025)](https://arxiv.org/abs/2506.06489) and [Marchetti et al. (2026)](https://arxiv.org/abs/2602.03655), which decompose the learning dynamics of modular addition in terms of Fourier modes;
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

- [Simon et al. (2023a)](https://arxiv.org/abs/2303.15438), for which the QR decomposition was the right tool for understanding dynamics from random initialization;
- [Karkada et al. (2026)](https://arxiv.org/abs/2602.15029), which used a Kronecker-factorizable model of analogies in natural language.

Petersen and Pedersen's [Matrix Cookbook](https://www.math.uwaterloo.ca/~hwolkowi/matrixcookbook.pdf) is a great bible for linear-algebraic identities (and for the matrix derivatives discussed below).
:::

### Matrix calculus

Matrix ODEs show up often, and you should know how to solve the classic ones, including linear ODEs with exponential dynamics. Derivative identities are also often useful. For example:

$$
\frac{d \ [\mathbf{A}^{-1}]_{ij}}{d \ A_{k \ell}} = -[\mathbf{A}^{-1}]_{ik} [\mathbf{A}^{-1}]_{\ell j}.
$$

Derivatives of matrix expressions can't always be written out in closed form like this, but it's useful to know the cases that can, and why they can, so you can spot 'em in the wild.

::: callout Illustrative papers
[Simon et al. (2021)](https://arxiv.org/abs/2110.03922) and [Simon et al. (2023b)](https://arxiv.org/abs/2311.14646), which use matrix derivatives in deriving the central eigenframeworks.
:::

### Gram-Schmidt

The Gram-Schmidt process takes in a sequence of arbitrary vectors (or functions, or general elements of an inner-product space) and returns an orthonormalized version of that sequence. Often this is just a numerical convenience, but sometimes it's actually the right conceptual way to understand system dynamics.

::: callout Illustrative paper
In [Karkada et al. (2025b)](https://arxiv.org/abs/2510.14878), we found that kernel eigensystems w.r.t. real data distributions can be very well predicted by a Gram-Schmidt process.
:::

### Kernels generally

It's often useful to construct a kernel function out of a multidimensional nonlinear map. If life gives you a map $\vx \mapsto \vphi(\vx)$, make the kernel function $K(\vx, \vx') := \langle \vphi(\vx), \vphi(\vx') \rangle$. Then apply all the above tricks and techniques and see if any work.

## Approximation techniques

These are tools to try when you have a system you want to solve, but you can't solve it in closed form, so you want an approximate solution. This happens a lot![SIDENOTE: …and if physics is any guide, we should *expect* it to happen a lot! Essentially any analytically solvable physical system (a harmonic oscillator, the Hydrogen atom, a free field theory) is a toy model which only comes out of a real physical system after several layers of approximation. It's well and good to use approximations; the art's just in making sure that (a) the approximations are insightful, and (b) you're not throwing out the baby with the bathwater, so you can later return to your original system having learned something new and useful about it.] Here are the mathematical approximation techniques we've found most useful.

### Taylor series

A staple of the mathematical sciences. Plenty of systems are solvable if you replace a general function with a low-order polynomial, and a Taylor series is a good workhorse way to make that replacement. The *modus operandi* is to expand the function in question around some point, discard all terms above some order, and solve the system. (Of course, one must then return to the original system and check — usually numerically — that this approximate solution resembles the true solution.) We've gotten a ton of mileage out of thinking about different aspects of learning processes in terms of Taylor series.

::: callout Illustrative papers
- [Karkada et al. (2025a)](https://arxiv.org/abs/2502.09863), which solves the dynamics of `word2vec` by approximating the loss surface to fourth order;
- [Jacot et al. (2018)](https://arxiv.org/abs/1806.07572), and the entire ensuing NTK literature, begins by taking a first-order Taylor series in the network function.[FOOTNOTE: See Section 2.1 of [the learning mechanics perspective paper](https://arxiv.org/abs/2604.21691) for a discussion of this literature.]
:::

### Perturbation theory

This is a cousin to Taylor series, but it's a different way of thinking. The setup here is that we have an analytically solvable reference system, and we've added some small perturbation to it, usually one which makes the problem in question nonlinear and no longer solvable exactly. For most systems, if you nudge the system parameters in a small way, the resulting behavior (or whatever the downstream quantities of interest are) will also only get a small nudge. Perturbation theory is a set of tools for asking: how does the downstream quantity change to first, second, etc. order in the size of the perturbation?

As [its wiki page](https://en.wikipedia.org/wiki/Perturbation_theory#Prototypical_example) explains, perturbation theory is used all over physics. It's most commonly seen when asking questions like: how do the singular values and vectors of a matrix change upon a small perturbation? (See e.g. [Weyl's inequality](https://en.wikipedia.org/wiki/Weyl%27s_inequality).)

::: callout Illustrative paper
[Karkada et al. (2025b)](https://arxiv.org/abs/2510.14878), which uses perturbation theory to prove its Theorem 2 about kernel eigensystems.
:::

### Approximating discrete as continuous and vice versa

Sometimes, faced with a discrete system, it's useful to make some kind of continuum approximation that aids analytical tractability. Sometimes (though more rarely), it's useful to do the reverse!

This is a trick that shows up again and again all over math and physics. Suppose you want to approximate a sum $\sum_{i=a}^b f(i)$. You can often do pretty well by approximating it by the integral $\int_a^b f(i)$. Got a large but finite number of particles in a gas vessel? You can probably do well by treating it as infinite and taking a continuum approximation.

On the other hand, it's often simpler to think about a small discrete set of objects rather than keep track of a continuous process! This is rarer in mathematics, but in the applied sciences, it's common to seek some sort of low-dimensional model of a system under study that's easier to reason about than the original.

::: callout Illustrative papers
Discrete → Continuous:

- The Discretization Hypothesis in [the learning mechanics perspective paper](https://arxiv.org/abs/2604.21691) is essentially a conjecture that the ground-truth processes in deep learning are fundamentally continuous;
- any paper that studies gradient flow as a proxy for gradient descent;
- any paper that studies infinite-width nets as a proxy for finite-width nets.

---

Continuous → Discrete:

- [Jacot et al. (2021)](https://arxiv.org/abs/2106.15933), which decomposes the dynamics of deep linear nets into a sequence of discrete jumps;
- [Kunin et al. (2025)](https://arxiv.org/abs/2506.06489), which does the same for shallow nets.

This is also a unifying theme of [Jamie's thesis.](https://www.proquest.com/docview/3175811920?pq-origsite=gscholar&fromopenview=true&sourcetype=Dissertations%20&%20Theses)
:::

### Numerical approximation techniques

Of course, any numerical process — including the training of deep neural nets and all the numerical math we run to analyze them — relies on a deep stack of numerical approximations. Most of these are tricks for doing fast linear algebra. These are mostly out of scope for this list — we're mostly covering math tricks for the theorist, not for the GPU — but they're worth a mention.

## Taking limits

We get tons of use out of taking limits in which system parameters go to zero or infinity. More or less every paper we write — and in fact most calculations we perform — are implicitly or explicitly relying on one or more limits in order to simplify a system or isolate phenomena of interest.

You should get very comfortable with taking limits to simplify systems. It's worth noting that these limits often need to be taken jointly: for example, one obtains the gradient flow limit of gradient descent not just by taking the learning rate $\eta$ to zero, but by taking the number of steps $T$ to grow to infinity, holding the "effective time" $\tau := \eta \cdot T$ constant. Use limits as tools to aid your understanding, but as with approximations, be sure not to throw the baby out with the bathwater.

::: callout Illustrative paper
See Section 2.2 of [the learning mechanics perspective paper](https://arxiv.org/abs/2604.21691) for an extended discussion.
:::

## Scaling arguments

Scaling arguments are essentially arguments about exponents. You can often make arguments that look like:

```
when Thing A doubles, Thing B will quadruple.
```

or:

```
when Thing A doubles, Thing B must halve in order to preserve the value of Thing C.
```

Our above example about holding effective time $\tau = \eta \cdot T$ constant is an example of the latter.

The joy and beauty of scaling arguments is that you can forget the constant prefactors and still get out pretty insightful results a lot of the time! For example, if you know that two scalars $x, y$ are related as

$$
x = a \cdot y^b
$$

for constants $a, b$, and you know that $x, y$ are going to vary over many orders of magnitude, then it's probably way more useful to know $b$ than to know $a$.[FOOTNOTE: This is precisely the logic behind Big-O notation in computer science. Knowing an algorithm runs in time that *grows like* $n \log n$ is much more important than knowing the actual constant in front of the $n \log n$ there.] This sort of argument is used all over physics, especially when equations have order-one prefactors it'd be hard to compute but nice exponents that are easy to find.

### Hyperparameter scaling arguments

Scaling arguments are particularly useful when applied to hyperparameters.

::: callout Illustrative papers
- [Yang and Hu (2020)](https://arxiv.org/abs/2011.14522) and [Yang et al. (2023)](https://arxiv.org/abs/2310.17813), which give joint scaling arguments for width and learning rate;
- [Atanasov et al. (2024)](https://arxiv.org/abs/2410.04642), which gives joint scaling arguments for learning rate and feature output multiplier.

Also see Section 2.4 of the [learning mechanics perspective paper](https://arxiv.org/abs/2604.21691) for a detailed discussion of hyperparameter scaling arguments.
:::

### Dimensional analysis

Dimensional analysis is an approach to finding scaling exponents that starts by assigning sensible units to different quantities, then demands that the units "work out." For example, if a loss function $\mathcal{L}$ has units $\text{[L]}$, and the network parameters $\vtheta$ have units $\text{[D]}$ (for "distance"), then the gradient $\nabla_{\vtheta} \mathcal{L}$ has units $\left[ \frac{\text{L}}{{\text{D}}} \right]$, and since gradient descent updates as $\vtheta \mapsto \vtheta - \eta \cdot \nabla_{\vtheta} \mathcal{L}$, the learning rate $\eta$ must therefore have units $\left[ \text{D}^2 \right]$.

We can't think of any ML theory papers that really illustrate dimensional analysis like this, but it's a useful tool for doing this sort of work. It lets you sanity-check your work and think more clearly about the processes under study.

### Powerlaws

It's often quite useful to assume that a given quantity in a deep learning system scales according to a powerlaw with some nontrivial exponent. This is useful because it's often both analytically tractable to work with *and* realistic. Get used to working with powerlaws and the sorts of things that can and can't easily be computed from them.

::: callout Illustrative papers
- [Kaplan et al. (2020)](https://arxiv.org/abs/2001.08361), the famous paper which showed that LLM loss curves scale with model size according to powerlaws;
- [Simon et al. (2023b)](https://arxiv.org/abs/2311.14646), which makes powerlaw ansatzes for modeling kernel eigenstructure w.r.t. image datasets;
- [Ruderman (1997)](https://www.sciencedirect.com/science/article/pii/S0042698997000084), a classic paper which shows that images have PCA power spectra that decay as powerlaws.
:::

## Tools for dynamical systems

As the name "learning mechanics" suggests, there are lots of senses in which the training of deep neural nets resembles a physical dynamical process. As a result, there are tons of basic math techniques for dynamical systems which come in useful.

### A handful of simple ODEs

You should know how to identify (and solve, when solvable) various linear ODEs, oscillatory ODEs, ODEs that give logistic growth and saturation, and the ODEs that come up in the study of [deep linear networks](https://learningmechanics.pub/deep-linear-nets/), which show up surprisingly often (e.g. in the toy model of [Atanasov et al. (2024)](https://arxiv.org/abs/2410.04642)).

### Random walks

Brownian motion, the OU process, and diffusion processes. These show up all the time when studying SGD.

### Symmetries and conserved quantities

Noether's theorem (not the Lagrangian part, but the main intuition) and conserved quantities from symmetries.

::: callout Illustrative papers
- [Kunin et al. (2020)](https://arxiv.org/abs/2012.04728), which enumerates conserved quantities in deep nets;
- [Deep linear networks](https://learningmechanics.pub/deep-linear-nets/) in general, whose "balancedness" property results from a conservation law.
:::

## Tools for and involving Gaussians

Gaussian functions and distributions show up enough in our work that we decided they deserved their own category.

### Gaussian universality

For lots of complex systems, you can replace a complicated distribution with a moment-matched Gaussian distribution and the downstream phenomena you care about remain unchanged! This can give a way to solve things that were previously insoluble: just solve it for a Gaussian instead (and then make sure that actually agrees with your original system).

::: callout Illustrative papers
- the KRR eigenframework (see e.g. [Simon et al. (2021)](https://arxiv.org/abs/2110.03922) and refs therein), which relies on Gaussian universality in feature space;
- [Karkada et al. (2025b)](https://arxiv.org/abs/2510.14878), which relies on Gaussian universality in the data space.
:::

### Gaussian integrals

We've cumulatively spent many hours reading [this Wikipedia page](https://en.wikipedia.org/wiki/Common_integrals_in_quantum_field_theory). Wick's theorem (aka Isserlis' theorem) is also super useful.

## Random matrix theory

RMT is a workhorse of deep learning theory. We don't often use formal techniques for proving things with RMT, but we do often use basic facts. Useful to at least know the semicircle, circle, and quarter-circle laws.

## Notation + bookkeeping

If by "math trick" we mean something that makes it easier to perform a calculation, notational tricks are also worth including. For example, Einstein notation's super useful for keeping track of big tensor contractions. Another recent lab favorite is [Penrose graphical notation](https://en.wikipedia.org/wiki/Penrose_graphical_notation), which lets you track tensor contractions visually. Much easier than any inline symbolic notation we know, and has saved us many headaches (and resulted in many pretty diagrams left on whiteboards).

## Tools we mostly don't use

We really don't find ourselves using the following:

- information theory, really at all;
- most geometry, including differential geometry;
- most group theory + algebra;
- most Bayesian math stuff, excepting a few concepts like Bayes-optimality;
- most bounds + inequalities, excepting a few basic ones like Jensen's and Cauchy-Schwarz.

We mention these because these things get a lot of airtime and tend to be rather flashy and fashionable, but we really haven't found them that useful for doing meaningful science work. Your mileage may vary, but the whole point we're writing this is to highlight the (often unglamorous) useful tools… so do select the right tool for the job, don't select jobs based on which tools you want to use.

---

*Thanks to Keon Abedi for contributions to the list.*
