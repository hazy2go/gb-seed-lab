# Builds of the one generator source: native (tests, tools) and WebAssembly (web page, mint server).
# The Game Boy build is in ../gb.
CLANG_WASM ?= /opt/homebrew/opt/llvm/bin/clang
WASM_LD ?= /opt/homebrew/opt/lld/bin
SRC = gen_core.c gen_traits.c gen_sky.c gen_ridges.c gen_volcano.c gen_ground.c gen_special.c gen_names.c gen_banner.c
DEPS = $(SRC) gen.h gen_int.h

all: gen_host ../web/gen.wasm

gen_host: $(DEPS) gen_host.c
	cc -std=c99 -O2 -Wall -Wextra -o $@ $(SRC) gen_host.c

../web/gen.wasm: $(DEPS) gen_wasm.c
	PATH="$(WASM_LD):$$PATH" $(CLANG_WASM) --target=wasm32 -std=c99 -O2 -ffreestanding -nostdlib \
	  -Wl,--no-entry -Wl,--export-dynamic -Wl,--strip-all -o $@ $(SRC) gen_wasm.c

clean:
	rm -f gen_host ../web/gen.wasm
.PHONY: all clean
