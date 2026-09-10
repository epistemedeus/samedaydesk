# Why generic HTML extraction misses issue comments

Paid operators often ask why a plain HTML fetch of a GitHub issue page is not enough for comment evidence.

GitHub's public issue **HTML** is a progressive UI shell. Comment threads are not guaranteed to appear as a complete, stable list in the first HTML document the way a spreadsheet export would. Client-rendered sections, pagination, and omitted thread bodies mean a generic HTML extractor can miss comments that still exist in the discussion — without that miss proving a paid HTML product "failed," and without implying that any single capture (HTML or API) is a full historical archive of GitHub.

This package therefore reads the **public GitHub REST issue and comments endpoints** with explicit page bounds, per-page limits, and completeness labels (`complete` / `partial` / `error`). Operators get an honest retrieval status instead of a silently truncated HTML scrape.

Out of scope here: new commercial offers, hosted routes, sales claims, or posts to external channels.
