.PHONY: setup data features train test dev build all

setup:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements.txt
	cd web && npm install

data:
	.venv/bin/python -m pipeline.fetch_data

features:
	.venv/bin/python -m pipeline.build_features

train: features
	.venv/bin/python -m pipeline.train_models

test:
	.venv/bin/python -m pytest pipeline/tests -q
	cd web && npm test

dev:
	cd web && npm run dev

build:
	cd web && npm run build

all: data train test build
