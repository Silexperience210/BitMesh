import urllib.request
import json

url = 'https://api.github.com/repos/Silexperience210/BitMesh/actions/runs?per_page=10'
req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github.v3+json'})
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode())
for r in data['workflow_runs']:
    status = r.get('conclusion', 'N/A') if r['status'] == 'completed' else r['status']
    print(f"Run #{r['run_number']}: {status} - {r['head_commit']['message'][:50]}...")
