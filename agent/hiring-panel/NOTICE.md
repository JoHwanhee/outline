# Hiring Panel attribution

The bundled SKILL.md is the original hiring-panel skill, version 1.0.0.
Author: Alex Chen (@nocodealex) · https://chen.media
Declared license: MIT (see the original skill front matter).

Outline adapts its workflow to the configured Codex SDK or Claude Agent SDK connection: seven fresh reviewer threads (including five concurrent readers), a synthesis/rewrite thread and a fresh automated-screen thread. The original skill refers to Claude; this integration records the selected SDK and model and identifies that provider in its UI and stored results.

App-specific adaptations: persisted document/version snapshots, document-specific history, validation of quoted evidence, cancellation, read-only evaluation without repository/source tools, download artifacts under data/panels/<evaluation-id>/, and explicit application of the improved draft using the existing document history and conflict checks. Original skill attribution is retained at the end of both exported Markdown files.
