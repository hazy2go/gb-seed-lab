# Game Boy ROM: MBC5 + 32 KB cartridge RAM (the 160x144 byte-per-pixel buffer needs 23 KB).
# The drawing phases go to switchable banks (autobank); gen_core.c and main.c stay in the fixed bank.
GBDK ?= $(HOME)/Toolchains/gbdk
LCC = $(GBDK)/bin/lcc
CFLAGS = -Wl-m -Wl-j -Wm-yn"SLOWHRZN" -Wm-yt0x1B -Wm-ya4 -Wm-yoA -autobank -Wb-ext=.rel -Wf--opt-code-size
GEN = ../gen
OBJ = main.o conv.o fastmath.o gen_core.o gen_traits.o gen_sky.o gen_ridges.o gen_volcano.o gen_ground.o gen_special0.o gen_special1.o gen_special2.o gen_special3.o gen_special4.o

seedlab.gb: $(OBJ)
	$(LCC) $(CFLAGS) -o $@ $(OBJ)

main.o: main.c $(GEN)/gen.h
	$(LCC) $(CFLAGS) -c -o $@ main.c
conv.o: conv.s
	$(LCC) $(CFLAGS) -c -o $@ conv.s
fastmath.o: fastmath.s
	$(LCC) $(CFLAGS) -c -o $@ fastmath.s
# the 1/1 scenes: one source, five parts, one ROM bank each (see the top of gen/gen_special.c)
gen_special%.o: gen_special%.c $(GEN)/gen_special.c $(GEN)/gen.h $(GEN)/gen_int.h
	$(LCC) $(CFLAGS) -c -o $@ $<
%.o: $(GEN)/%.c $(GEN)/gen.h $(GEN)/gen_int.h
	$(LCC) $(CFLAGS) -c -o $@ $<

test/mathtest.gb: test/mathtest.c fastmath.o
	$(LCC) -Wl-m -Wl-j -o $@ test/mathtest.c fastmath.o

clean:
	rm -f *.o *.gb *.map *.noi *.sym *.lst *.ihx *.rel *.cdb *.adb *.asm
.PHONY: clean
