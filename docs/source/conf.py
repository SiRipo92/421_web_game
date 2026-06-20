"""Sphinx configuration for the 421 Bistro docs site.

Lives at 421bistro.readthedocs.io. ReadTheDocs builds from this file
on every push to main (see .readthedocs.yaml at the repo root).

Doc structure:
  docs/source/conf.py             — this file
  docs/source/index.rst           — landing page + table of contents
  docs/source/architecture.rst    — high-level system overview
  docs/source/api/                — autodoc'd Python API reference
  docs/SECURITY.md                — existing runbook (linked via MyST)
  docs/DEPLOY_SETUP.md            — existing runbook (linked via MyST)

Add new pages by creating .rst or .md files under docs/source/ and
including them in the toctree in index.rst.
"""

import os
import sys
from datetime import datetime

# Make `app/` importable so autodoc can resolve `app.routers.auth` etc.
# conf.py lives at docs/source/conf.py → repo root is two parents up.
sys.path.insert(0, os.path.abspath("../.."))

# -- Project information -----------------------------------------------------

project = "421 Bistro"
copyright = f"{datetime.now().year}, Sierra Ripoche. All rights reserved."
author = "Sierra Ripoche"
release = "0.1.0"  # bump on each tagged release

# -- General configuration ---------------------------------------------------

extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.napoleon",  # Google / NumPy docstring styles
    "sphinx.ext.viewcode",  # adds "[source]" links to autodoc entries
    "sphinx.ext.intersphinx",  # cross-link to Python / FastAPI / SQLAlchemy
    "sphinx_autodoc_typehints",  # type hints rendered alongside params
    "myst_parser",  # so we can include the existing docs/*.md
]

templates_path = ["_templates"]
exclude_patterns = []

# Allow both .rst (Sphinx-native) and .md (existing docs/) files.
source_suffix = {
    ".rst": "restructuredtext",
    ".md": "markdown",
}

# Cross-reference Python stdlib, FastAPI, SQLAlchemy docs.
intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
    "fastapi": ("https://fastapi.tiangolo.com", None),
    "sqlalchemy": ("https://docs.sqlalchemy.org/en/20", None),
}

# -- autodoc options ---------------------------------------------------------

autodoc_default_options = {
    "members": True,
    "undoc-members": False,  # skip undocumented members from the output
    "show-inheritance": True,
    "member-order": "bysource",  # preserve source order for readability
}

# Sphinx-autodoc-typehints: render types alongside parameters, not in the
# signature line — keeps signatures readable.
always_use_bars_union = True
typehints_fully_qualified = False
typehints_document_rtype = True

# -- HTML output -------------------------------------------------------------

html_theme = "sphinx_rtd_theme"
html_static_path = ["_static"]
html_title = f"{project} documentation"

html_theme_options = {
    "navigation_depth": 4,
    "collapse_navigation": False,
    "sticky_navigation": True,
}

# -- MyST (Markdown) options -------------------------------------------------

myst_enable_extensions = [
    "colon_fence",  # ::: blocks
    "deflist",  # term/definition lists
    "tasklist",  # GitHub-style checkboxes in markdown
    "linkify",  # auto-link bare URLs
]
