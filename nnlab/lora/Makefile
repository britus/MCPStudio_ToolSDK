CONFIG ?= config/mcpstudio-v3.toml
INPUTS ?=

PREPARE_ARGS ?=
PREPARE_DOCS_ARGS ?=
INDEX_ARGS ?=
PIPELINE_ARGS ?=
TRAIN_ARGS ?=
CHAT_ARGS ?=
EVALUATE_ARGS ?=
VERIFY_ARGS ?=
MERGE_ARGS ?=
FUSE_ARGS ?=
DEPLOY_ARGS ?=
EXPORT_ARGS ?=

INPUT_FLAGS = $(foreach input,$(INPUTS),--input "$(input)")
PROJECT_FLAGS = $(foreach input,$(INPUTS),--project "$(input)")

.PHONY: setup setup-rag setup-train setup-cuda prepare prepare-docs index pipeline \
	train smoke-train chat evaluate evaluate-base verify-suite merge-adapters fuse \
	deploy-lmstudio export-gguf test

setup:
	./scripts/setup.sh --mlx

setup-rag:
	./scripts/setup.sh --rag-only

setup-train:
	./scripts/setup.sh --train

setup-cuda:
	./scripts/setup.sh --cuda

prepare:
	@test -n "$(strip $(INPUTS))" || (echo "Use: make prepare INPUTS='/path/project /path/file.swift' [CONFIG=config/file.toml]" && exit 2)
	./scripts/prepare.sh --config "$(CONFIG)" $(INPUT_FLAGS) $(PREPARE_ARGS)

prepare-docs:
	@test -n "$(strip $(INPUTS))" || (echo "Use: make prepare-docs INPUTS='/path/doc.txt /path/docs' [CONFIG=config/file.toml]" && exit 2)
	./scripts/prepare_docs.sh --config "$(CONFIG)" $(INPUT_FLAGS) $(PREPARE_DOCS_ARGS)

index:
	@test -n "$(strip $(INPUTS))" || (echo "Use: make index INPUTS='/path/project-a /path/project-b' [CONFIG=config/file.toml]" && exit 2)
	./scripts/index.sh --config "$(CONFIG)" build $(PROJECT_FLAGS) $(INDEX_ARGS)

pipeline:
	@test -n "$(strip $(INPUTS))" || (echo "Use: make pipeline INPUTS='/path/project-a /path/project-b' [CONFIG=config/file.toml]" && exit 2)
	./scripts/pipeline.sh --config "$(CONFIG)" $(INPUT_FLAGS) $(PIPELINE_ARGS)

train:
	./scripts/train.sh --config "$(CONFIG)" $(TRAIN_ARGS)

smoke-train:
	./scripts/smoke_train.sh --config "$(CONFIG)" $(TRAIN_ARGS)

chat:
	./scripts/chat.sh --config "$(CONFIG)" $(CHAT_ARGS)

evaluate:
	./scripts/evaluate.sh --config "$(CONFIG)" $(EVALUATE_ARGS)

evaluate-base:
	./scripts/evaluate_base.sh --config "$(CONFIG)" $(EVALUATE_ARGS)

verify-suite:
	./scripts/verify_suite.sh --config "$(CONFIG)" $(VERIFY_ARGS)

merge-adapters:
	./scripts/merge_adapters.sh --config "$(CONFIG)" $(MERGE_ARGS)

fuse:
	./scripts/fuse_model.sh --config "$(CONFIG)" $(FUSE_ARGS)

deploy-lmstudio:
	./deploy/lm-studio/install.sh --config "$(CONFIG)" $(DEPLOY_ARGS)

export-gguf:
	./scripts/export_gguf.sh --config "$(CONFIG)" $(EXPORT_ARGS)

test:
	./scripts/test.sh
