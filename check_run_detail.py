import urllib.request
import json
import sys

run_id = sys.argv[1] if len(sys.argv) > 1 else "174"
url = f'https://api.github.com/repos/Silexperience210/BitMesh/actions/runs/{run_id}'
req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github.v3+json'})
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode())
print(f"Run {run_id}: {data['status']}")
print(f"Conclusion: {data.get('conclusion', 'N/A')}")
print(f"Created at: {data['created_at']}")
print(f"Updated at: {data['updated_at']}")
print(f"HTML URL: {data['html_url']}")
