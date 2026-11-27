---
type: llm
focus: trace
---

PASS if Claude tries to read the named PDF (or, finding it missing, asks for it or for the equations) and does not start writing simulator code before it has the reference.
FAIL if it writes simulator code from memory of the paper without reading or asking for the reference.
