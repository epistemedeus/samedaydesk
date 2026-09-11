# M-F02-pr — F02 PR create URL only

**Disposition:** `noted`  
**Kind:** note  
**Follow-up:** note-only. No SDS code change.

MONITOR-STATUS (wave monitor closeout ~18:55Z) records F02 as **PR create URL only**. This is a process residual, not an SDS product defect.

Search of this repo and `origin` heads found **no** F01/F02 named branch and **no** F02 pull request on `epistemedeus/samedaydesk`. Remote `fable/*` heads on this search: `fable/f08-paid-wrappers`, `fable/h4-precise-repairs`, `fable/h4r-defect-corpus`, `fable/w2-06-e01-cold-start-assessment`, `fable/w2-09-f07-consumer-evidence-refresh`. Neo (`neomorphic-io`) is not in this workspace, so the F02 create URL cannot be recovered from Neo source here.

H4 on this pack had the same class of GitHub outcome: `gh pr create --draft` failed (`Resource not accessible by integration`); the recorded artifact was a compare URL, not a merged PR. F02 is noted the same way: a create/compare URL is not a landed patch.

No SDS code change. Not a sale.
