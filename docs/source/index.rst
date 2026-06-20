421 Bistro documentation
========================

Welcome to the engineering documentation for **421 Bistro**, a
real-time multiplayer implementation of the French dice game *421*.

This site documents the architecture, the auth + game-state model,
the operations runbooks, and the Python API. It complements the
`README on GitHub <https://github.com/SiRipo92/421_web_game>`_,
which is the entry point for repo navigation.

.. note::

   This project is published for portfolio review only. The source
   code is not licensed for use, modification, or redistribution.
   See the `LICENSE <https://github.com/SiRipo92/421_web_game/blob/main/LICENSE>`_.

.. toctree::
   :maxdepth: 2
   :caption: Architecture

   architecture

.. toctree::
   :maxdepth: 2
   :caption: Operations

   ../DEPLOY_SETUP.md
   ../SECURITY.md
   ../PROD_SMOKE_TESTS.md
   ../PERFORMANCE_BASELINE.md

.. toctree::
   :maxdepth: 2
   :caption: Security audit

   ../SECURITY_AUDIT_2026-06.md

.. toctree::
   :maxdepth: 1
   :caption: Project planning

   ../ROADMAP.md

.. toctree::
   :maxdepth: 3
   :caption: API reference

   api/index

Indices
=======

* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`
