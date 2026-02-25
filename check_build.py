import urllib.request
import json
import sys

run_id = sys.argv[1] if len(sys.argv) > 1 else "22398823119"
url = f'https://api.github.com/repos/Silexperience210/BitMesh/actions/runs/{run_id}/jobs'
req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github.v3+json'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    for job in data['jobs']:
        print(f"{job['name']}: {job['conclusion']}")
        for step in job['steps']:
            if step['conclusion'] == 'failure':
                print(f"  FAIL: {step['name']}")
