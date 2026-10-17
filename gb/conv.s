; gb-seed-lab: one pixel row (160 bytes of the picture buffer) to 2bpp tile rows, the hot loop of gen_phase.
; Same rules as the C version it replaces: hard pixels (>= 200) keep their shade, tones >= 192 are shade 3,
; other tones are (tone + Bayer threshold) >> 6. Output: 20 tiles x (lo, hi) at conv_out, stride 16.
;   inputs (globals): conv_src = row pointer, conv_out = first output byte, conv_bay[8] = threshold row
	.module	conv
	.globl	_conv_src, _conv_out, _conv_bay, _conv_diff
	.area	_CODE

_conv_row::
	PUSH	BC
	PUSH	DE
	LD	A,(_conv_src)
	LD	L,A
	LD	A,(_conv_src+1)
	LD	H,A
	LD	E,#20
1$:
	LD	A,(HL+)
	CP	#200
	JR	NC,20$		; hard pixel: bits 0-1 are the shade
	CP	#192
	JR	NC,40$		; tone >= 192: always shade 3
	LD	D,A
	LD	A,(_conv_bay+0)
	ADD	A,D		; v + threshold <= 254
	RLCA
	RLCA			; bits 0-1 = (v + threshold) >> 6
	JR	20$
40$:	LD	A,#3
20$:	RRA
	RL	B		; low bitplane
	RRA
	RL	C		; high bitplane
	LD	A,(HL+)
	CP	#200
	JR	NC,21$		; hard pixel: bits 0-1 are the shade
	CP	#192
	JR	NC,41$		; tone >= 192: always shade 3
	LD	D,A
	LD	A,(_conv_bay+1)
	ADD	A,D		; v + threshold <= 254
	RLCA
	RLCA			; bits 0-1 = (v + threshold) >> 6
	JR	21$
41$:	LD	A,#3
21$:	RRA
	RL	B		; low bitplane
	RRA
	RL	C		; high bitplane
	LD	A,(HL+)
	CP	#200
	JR	NC,22$		; hard pixel: bits 0-1 are the shade
	CP	#192
	JR	NC,42$		; tone >= 192: always shade 3
	LD	D,A
	LD	A,(_conv_bay+2)
	ADD	A,D		; v + threshold <= 254
	RLCA
	RLCA			; bits 0-1 = (v + threshold) >> 6
	JR	22$
42$:	LD	A,#3
22$:	RRA
	RL	B		; low bitplane
	RRA
	RL	C		; high bitplane
	LD	A,(HL+)
	CP	#200
	JR	NC,23$		; hard pixel: bits 0-1 are the shade
	CP	#192
	JR	NC,43$		; tone >= 192: always shade 3
	LD	D,A
	LD	A,(_conv_bay+3)
	ADD	A,D		; v + threshold <= 254
	RLCA
	RLCA			; bits 0-1 = (v + threshold) >> 6
	JR	23$
43$:	LD	A,#3
23$:	RRA
	RL	B		; low bitplane
	RRA
	RL	C		; high bitplane
	LD	A,(HL+)
	CP	#200
	JR	NC,24$		; hard pixel: bits 0-1 are the shade
	CP	#192
	JR	NC,44$		; tone >= 192: always shade 3
	LD	D,A
	LD	A,(_conv_bay+4)
	ADD	A,D		; v + threshold <= 254
	RLCA
	RLCA			; bits 0-1 = (v + threshold) >> 6
	JR	24$
44$:	LD	A,#3
24$:	RRA
	RL	B		; low bitplane
	RRA
	RL	C		; high bitplane
	LD	A,(HL+)
	CP	#200
	JR	NC,25$		; hard pixel: bits 0-1 are the shade
	CP	#192
	JR	NC,45$		; tone >= 192: always shade 3
	LD	D,A
	LD	A,(_conv_bay+5)
	ADD	A,D		; v + threshold <= 254
	RLCA
	RLCA			; bits 0-1 = (v + threshold) >> 6
	JR	25$
45$:	LD	A,#3
25$:	RRA
	RL	B		; low bitplane
	RRA
	RL	C		; high bitplane
	LD	A,(HL+)
	CP	#200
	JR	NC,26$		; hard pixel: bits 0-1 are the shade
	CP	#192
	JR	NC,46$		; tone >= 192: always shade 3
	LD	D,A
	LD	A,(_conv_bay+6)
	ADD	A,D		; v + threshold <= 254
	RLCA
	RLCA			; bits 0-1 = (v + threshold) >> 6
	JR	26$
46$:	LD	A,#3
26$:	RRA
	RL	B		; low bitplane
	RRA
	RL	C		; high bitplane
	LD	A,(HL+)
	CP	#200
	JR	NC,27$		; hard pixel: bits 0-1 are the shade
	CP	#192
	JR	NC,47$		; tone >= 192: always shade 3
	LD	D,A
	LD	A,(_conv_bay+7)
	ADD	A,D		; v + threshold <= 254
	RLCA
	RLCA			; bits 0-1 = (v + threshold) >> 6
	JR	27$
47$:	LD	A,#3
27$:	RRA
	RL	B		; low bitplane
	RRA
	RL	C		; high bitplane
	PUSH	HL		; store lo, hi and step the output by 16
	LD	A,(_conv_out)
	LD	L,A
	LD	A,(_conv_out+1)
	LD	H,A
	LD	(HL),B
	INC	HL
	LD	(HL),C
	LD	A,L
	ADD	A,#15
	LD	(_conv_out),A
	LD	A,H
	ADC	A,#0
	LD	(_conv_out+1),A
	POP	HL
	DEC	E
	JP	NZ,1$
	POP	DE
	POP	BC
	RET

; void dith_row(void): the final dither of gen_draw for one row, in place. Same rules as the C loop in
; gen_ground.c: hard -> HARD + (v & 3); tone -> HARD + min(3, (tone + threshold) >> 6).
_dith_row::
	PUSH	BC
	PUSH	DE
	LD	A,(_conv_src)
	LD	L,A
	LD	A,(_conv_src+1)
	LD	H,A
	LD	E,#20
5$:
	LD	A,(HL)
	CP	#200
	JR	C,60$
	AND	#3		; hard (and star) pixel: keep the shade
	ADD	A,#200
	JR	80$
60$:	CP	#192
	JR	C,70$
	LD	A,#203		; tone >= 192: shade 3
	JR	80$
70$:	LD	D,A
	LD	A,(_conv_bay+0)
	ADD	A,D
	RLCA
	RLCA
	AND	#3
	ADD	A,#200
80$:	LD	(HL+),A
	LD	A,(HL)
	CP	#200
	JR	C,61$
	AND	#3		; hard (and star) pixel: keep the shade
	ADD	A,#200
	JR	81$
61$:	CP	#192
	JR	C,71$
	LD	A,#203		; tone >= 192: shade 3
	JR	81$
71$:	LD	D,A
	LD	A,(_conv_bay+1)
	ADD	A,D
	RLCA
	RLCA
	AND	#3
	ADD	A,#200
81$:	LD	(HL+),A
	LD	A,(HL)
	CP	#200
	JR	C,62$
	AND	#3		; hard (and star) pixel: keep the shade
	ADD	A,#200
	JR	82$
62$:	CP	#192
	JR	C,72$
	LD	A,#203		; tone >= 192: shade 3
	JR	82$
72$:	LD	D,A
	LD	A,(_conv_bay+2)
	ADD	A,D
	RLCA
	RLCA
	AND	#3
	ADD	A,#200
82$:	LD	(HL+),A
	LD	A,(HL)
	CP	#200
	JR	C,63$
	AND	#3		; hard (and star) pixel: keep the shade
	ADD	A,#200
	JR	83$
63$:	CP	#192
	JR	C,73$
	LD	A,#203		; tone >= 192: shade 3
	JR	83$
73$:	LD	D,A
	LD	A,(_conv_bay+3)
	ADD	A,D
	RLCA
	RLCA
	AND	#3
	ADD	A,#200
83$:	LD	(HL+),A
	LD	A,(HL)
	CP	#200
	JR	C,64$
	AND	#3		; hard (and star) pixel: keep the shade
	ADD	A,#200
	JR	84$
64$:	CP	#192
	JR	C,74$
	LD	A,#203		; tone >= 192: shade 3
	JR	84$
74$:	LD	D,A
	LD	A,(_conv_bay+4)
	ADD	A,D
	RLCA
	RLCA
	AND	#3
	ADD	A,#200
84$:	LD	(HL+),A
	LD	A,(HL)
	CP	#200
	JR	C,65$
	AND	#3		; hard (and star) pixel: keep the shade
	ADD	A,#200
	JR	85$
65$:	CP	#192
	JR	C,75$
	LD	A,#203		; tone >= 192: shade 3
	JR	85$
75$:	LD	D,A
	LD	A,(_conv_bay+5)
	ADD	A,D
	RLCA
	RLCA
	AND	#3
	ADD	A,#200
85$:	LD	(HL+),A
	LD	A,(HL)
	CP	#200
	JR	C,66$
	AND	#3		; hard (and star) pixel: keep the shade
	ADD	A,#200
	JR	86$
66$:	CP	#192
	JR	C,76$
	LD	A,#203		; tone >= 192: shade 3
	JR	86$
76$:	LD	D,A
	LD	A,(_conv_bay+6)
	ADD	A,D
	RLCA
	RLCA
	AND	#3
	ADD	A,#200
86$:	LD	(HL+),A
	LD	A,(HL)
	CP	#200
	JR	C,67$
	AND	#3		; hard (and star) pixel: keep the shade
	ADD	A,#200
	JR	87$
67$:	CP	#192
	JR	C,77$
	LD	A,#203		; tone >= 192: shade 3
	JR	87$
77$:	LD	D,A
	LD	A,(_conv_bay+7)
	ADD	A,D
	RLCA
	RLCA
	AND	#3
	ADD	A,#200
87$:	LD	(HL+),A
	DEC	E
	JP	NZ,5$
	POP	DE
	POP	BC
	RET

; void cmp_copy(void): copy 320 bytes conv_src -> conv_out, set conv_diff = 1 if any byte differed.
_cmp_copy::
	PUSH	BC
	PUSH	DE
	LD	A,(_conv_src)
	LD	L,A
	LD	A,(_conv_src+1)
	LD	H,A
	LD	A,(_conv_out)
	LD	E,A
	LD	A,(_conv_out+1)
	LD	D,A
	LD	BC,#320
1$:
	LD	A,(DE)
	CP	(HL)
	JR	Z,2$
	LD	A,(HL)
	LD	(DE),A
	LD	A,#1
	LD	(_conv_diff),A
2$:
	INC	HL
	INC	DE
	DEC	BC
	LD	A,B
	OR	C
	JR	NZ,1$
	POP	DE
	POP	BC
	RET
