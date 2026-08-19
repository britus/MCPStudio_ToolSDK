.PHONY: setup setup-cuda prepare index train fuse merge-adapters evaluate evaluate-base test deploy-lmstudio

setup:
	./scripts/setup.sh --mlx

setup-cuda:
	./scripts/setup.sh --cuda

prepare:
	@test -n "$(PROJECTS)" || (echo "Use: make prepare PROJECTS='/path/project /path/file.swift'" && exit 2)
	./scripts/prepare.sh $(PROJECTS)

index:
	@test -n "$(PROJECTS)" || (echo "Use: make index PROJECTS='/path/a /path/b'" && exit 2)
	./scripts/index.sh $(PROJECTS)

train:
	./scripts/train.sh

fuse:
	./scripts/fuse_model.sh

merge-adapters:
	./scripts/merge_adapters.sh --in-place

deploy-lmstudio:
	./deploy/lm-studio/install.sh

evaluate:
	./scripts/evaluate.sh

evaluate-base:
	./scripts/evaluate_base.sh

test:
	./scripts/test.sh
