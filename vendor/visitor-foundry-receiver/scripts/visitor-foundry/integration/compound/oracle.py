"""Independent host oracle over parsed JSON. Never executes a contribution."""
import json,sys
value=json.load(sys.stdin)
payload=value.get('structuredContent')
if not isinstance(payload,dict): result={'outcome':'unsupported','payload':{}}
else:
    outcome='error' if value.get('isError') is True else 'observed'
    if isinstance(payload.get('error'),dict) and payload['error'].get('code')=='unknown_outcome':outcome='unknown'
    result={'outcome':outcome,'payload':payload}
print(json.dumps(result,ensure_ascii=False))
