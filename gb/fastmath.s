; gb-seed-lab: faster 32-bit multiply and divide for SDCC (sm83, sdcccall 1), linked in place of the library's
; C versions (the linker only pulls a library module for symbols nobody else defines). Same results: the low 32 bits
; of a * b; C division truncating towards zero, remainder with the sign of the dividend.
;   in:  a = DE:BC (DE high), b = 4 bytes on the stack above the return address (low byte first)
;   out: DE:BC; the callee removes b from the stack
; Scratch lives in WRAM, so these must not run from an interrupt (the serial and VBlank handlers never use them).
; Division by zero never happens in the generator (the native build would trap on it).
	.module	fastmath
	.globl	__mullong, __divulong, __modulong, __divslong, __modslong

	.area	_DATA
fm_a:	.ds	4	; multiplicand / dividend, then the quotient
fm_b:	.ds	4	; multiplier / divisor
fm_r:	.ds	4	; product / remainder
fm_t:	.ds	3	; trial difference (general division)
fm_s:	.ds	1	; signs: bit 0 negate the result

	.area	_CODE

; ---------------------------------------------------------------- multiply
; Bytewise: a * b mod 2^32 = sum of a_i * b_j << 8(i+j) for i + j <= 3; any product with a zero byte is skipped,
; so 16 x 16 bit operands (the common case) cost four 8 x 8 products.

; H * E -> HL (classic shift-add, unrolled); clobbers D
mul8:
	LD	L,#0
	LD	D,L
	ADD	HL,HL
	JR	NC,1$
	ADD	HL,DE
1$:	ADD	HL,HL
	JR	NC,2$
	ADD	HL,DE
2$:	ADD	HL,HL
	JR	NC,3$
	ADD	HL,DE
3$:	ADD	HL,HL
	JR	NC,4$
	ADD	HL,DE
4$:	ADD	HL,HL
	JR	NC,5$
	ADD	HL,DE
5$:	ADD	HL,HL
	JR	NC,6$
	ADD	HL,DE
6$:	ADD	HL,HL
	JR	NC,7$
	ADD	HL,DE
7$:	ADD	HL,HL
	JR	NC,8$
	ADD	HL,DE
8$:	RET

; fm_r[p..3] += a_i * b_j (16-bit product at byte p, carry up to byte 3)
	.macro	PROD	i, j, p, ?skip
	LD	A,(fm_a+i)
	OR	A
	JR	Z,skip
	LD	H,A
	LD	A,(fm_b+j)
	OR	A
	JR	Z,skip
	LD	E,A
	CALL	mul8
	LD	A,(fm_r+p)
	ADD	A,L
	LD	(fm_r+p),A
	LD	A,(fm_r+p+1)
	ADC	A,H
	LD	(fm_r+p+1),A
	.if	p - 2
	LD	A,(fm_r+p+2)
	ADC	A,#0
	LD	(fm_r+p+2),A
	.if	p
	.else
	LD	A,(fm_r+3)
	ADC	A,#0
	LD	(fm_r+3),A
	.endif
	.endif
skip:
	.endm

; fm_r[3] += low byte of a_i * b_j
	.macro	PROD3	i, j, ?skip
	LD	A,(fm_a+i)
	OR	A
	JR	Z,skip
	LD	H,A
	LD	A,(fm_b+j)
	OR	A
	JR	Z,skip
	LD	E,A
	CALL	mul8
	LD	A,(fm_r+3)
	ADD	A,L
	LD	(fm_r+3),A
skip:
	.endm

__mullong::
	CALL	fm_load
	XOR	A
	LD	HL,#fm_r
	LD	(HL+),A
	LD	(HL+),A
	LD	(HL+),A
	LD	(HL),A
	PROD	0, 0, 0
	PROD	0, 1, 1
	PROD	1, 0, 1
	PROD	0, 2, 2
	PROD	1, 1, 2
	PROD	2, 0, 2
	PROD3	0, 3
	PROD3	1, 2
	PROD3	2, 1
	PROD3	3, 0
	LD	HL,#fm_r
	JP	fm_ret

; a (DE:BC) -> fm_a, b (stack, above our caller's return address and fm_load's own) -> fm_b
fm_load:
	LD	HL,#fm_a
	LD	A,C
	LD	(HL+),A
	LD	A,B
	LD	(HL+),A
	LD	A,E
	LD	(HL+),A
	LD	(HL),D
	LDHL	SP,#4
	LD	DE,#fm_b
	LD	A,(HL+)
	LD	(DE),A
	INC	DE
	LD	A,(HL+)
	LD	(DE),A
	INC	DE
	LD	A,(HL+)
	LD	(DE),A
	INC	DE
	LD	A,(HL)
	LD	(DE),A
	RET

; return the 4 bytes at HL in DE:BC and drop b from the stack
fm_ret:
	LD	A,(HL+)
	LD	C,A
	LD	A,(HL+)
	LD	B,A
	LD	A,(HL+)
	LD	E,A
	LD	D,(HL)
	POP	HL
	ADD	SP,#4
	JP	(HL)

; ---------------------------------------------------------------- divide
; Unsigned core: fm_a / fm_b -> quotient in fm_a, remainder in fm_r.
; A divisor below 65536 (the common case) keeps the remainder in HL: shift-subtract one dividend byte at a time,
; skipping leading zero bytes (their quotient bytes are zero). A larger divisor leaves a quotient below 65536,
; so the top 16 bits go straight into the remainder and only 16 steps run, with a 32-bit remainder.
fm_udiv:
	LD	A,(fm_b+2)
	LD	HL,#fm_b+3
	OR	(HL)
	JR	NZ,50$
	LD	A,(fm_b)
	LD	E,A
	LD	A,(fm_b+1)
	LD	D,A
	LD	HL,#0
	LD	A,(fm_a+3)
	LD	C,A
	CALL	fm_dbyte
	LD	A,C
	LD	(fm_a+3),A
	LD	A,(fm_a+2)
	LD	C,A
	CALL	fm_dbyte
	LD	A,C
	LD	(fm_a+2),A
	LD	A,(fm_a+1)
	LD	C,A
	CALL	fm_dbyte
	LD	A,C
	LD	(fm_a+1),A
	LD	A,(fm_a)
	LD	C,A
	CALL	fm_dbyte
	LD	A,C
	LD	(fm_a),A
	LD	A,L
	LD	(fm_r),A
	LD	A,H
	LD	(fm_r+1),A
	XOR	A
	LD	(fm_r+2),A
	LD	(fm_r+3),A
	RET

; general case: remainder DE:HL starts as the dividend's top 16 bits; dividend low word in BC; -divisor in fm_b
50$:	LD	HL,#fm_b
	XOR	A
	SUB	(HL)
	LD	(HL+),A
	LD	A,#0
	SBC	A,(HL)
	LD	(HL+),A
	LD	A,#0
	SBC	A,(HL)
	LD	(HL+),A
	LD	A,#0
	SBC	A,(HL)
	LD	(HL),A
	LD	A,(fm_a)
	LD	C,A
	LD	A,(fm_a+1)
	LD	B,A
	LD	A,(fm_a+2)
	LD	L,A
	LD	A,(fm_a+3)
	LD	H,A
	LD	DE,#0
	LD	A,#16
51$:	PUSH	AF
	SLA	C
	RL	B
	RL	L
	RL	H
	RL	E
	RL	D
	JR	C,53$		; bit 32 set: the remainder is above any 32-bit divisor
	CALL	fm_trial
	JR	NC,54$
	JR	55$
53$:	CALL	fm_trial
55$:	LD	D,A		; commit remainder - divisor
	LD	A,(fm_t+2)
	LD	E,A
	LD	A,(fm_t+1)
	LD	H,A
	LD	A,(fm_t)
	LD	L,A
	INC	C		; quotient bit
54$:	POP	AF
	DEC	A
	JR	NZ,51$
	LD	A,C
	LD	(fm_a),A
	LD	A,B
	LD	(fm_a+1),A
	XOR	A
	LD	(fm_a+2),A
	LD	(fm_a+3),A
	LD	A,L
	LD	(fm_r),A
	LD	A,H
	LD	(fm_r+1),A
	LD	A,E
	LD	(fm_r+2),A
	LD	A,D
	LD	(fm_r+3),A
	RET

; DE:HL + (-divisor): low three bytes to fm_t, top byte in A, carry set when DE:HL >= divisor
fm_trial:
	LD	A,(fm_b)
	ADD	A,L
	LD	(fm_t),A
	LD	A,(fm_b+1)
	ADC	A,H
	LD	(fm_t+1),A
	LD	A,(fm_b+2)
	ADC	A,E
	LD	(fm_t+2),A
	LD	A,(fm_b+3)
	ADC	A,D
	RET

; 8 shift-subtract steps: dividend byte C in, quotient byte C out; remainder HL (< DE), divisor DE; clobbers A, B
fm_dbyte:
	LD	A,H
	OR	L
	OR	C
	RET	Z		; leading zero byte: quotient byte 0, remainder stays 0
	LD	B,#8
2$:	SLA	C
	RL	L
	RL	H
	JR	C,4$		; bit 16: above any 16-bit divisor
	LD	A,L
	SUB	E
	LD	A,H
	SBC	A,D
	JR	C,3$		; remainder < divisor
4$:	LD	A,L
	SUB	E
	LD	L,A
	LD	A,H
	SBC	A,D
	LD	H,A
	INC	C
3$:	DEC	B
	JR	NZ,2$
	RET

__divulong::
	CALL	fm_load
	CALL	fm_udiv
	LD	HL,#fm_a
	JP	fm_ret

__modulong::
	CALL	fm_load
	CALL	fm_udiv
	LD	HL,#fm_r
	JP	fm_ret

; signed: divide the magnitudes; the quotient is negative when the signs differ, the remainder takes the dividend's
__divslong::
	CALL	fm_load
	LD	A,(fm_a+3)
	LD	HL,#fm_b+3
	XOR	(HL)
	RLCA
	AND	#1
	LD	(fm_s),A
	CALL	fm_abs
	CALL	fm_udiv
	LD	HL,#fm_a
	JR	fm_sret

__modslong::
	CALL	fm_load
	LD	A,(fm_a+3)
	RLCA
	AND	#1
	LD	(fm_s),A
	CALL	fm_abs
	CALL	fm_udiv
	LD	HL,#fm_r
	; fall through

; negate the 4 bytes at HL when fm_s says so, then return them
fm_sret:
	LD	A,(fm_s)
	OR	A
	JP	Z,fm_ret
	PUSH	HL
	CALL	fm_neg
	POP	HL
	JP	fm_ret

; fm_a = |fm_a|, fm_b = |fm_b| (as unsigned: |-2^31| = 2^31)
fm_abs:
	LD	A,(fm_a+3)
	BIT	7,A
	JR	Z,1$
	LD	HL,#fm_a
	CALL	fm_neg
1$:	LD	A,(fm_b+3)
	BIT	7,A
	RET	Z
	LD	HL,#fm_b
	; fall through

; two's complement of the 4 bytes at HL; clobbers A, HL
fm_neg:
	XOR	A
	SUB	(HL)
	LD	(HL+),A
	LD	A,#0
	SBC	A,(HL)
	LD	(HL+),A
	LD	A,#0
	SBC	A,(HL)
	LD	(HL+),A
	LD	A,#0
	SBC	A,(HL)
	LD	(HL),A
	RET
