# LagosFile

LagosFile is a desktop application for tax filing with the Lagos State Internal Revenue Service (LIRS). It provides a comprehensive tax computation engine, document management, and seamless integration with the LIRS portal.

## Features

- PIN-protected encrypted database
- Tax computation engine with progressive tax bands
- Document management with 100MB file size limits
- FX rate service with caching
- Export capabilities (PDF, CSV, JSON)
- LIRS portal integration
- Profile management
- Filing history and amendments

## Installation

```bash
poetry install
```

## Usage

Run the application:

```bash
poetry run python -m lagosfile.main
```

## Development

```bash
poetry run pytest
```
