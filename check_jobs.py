import urllib.request
import json

run_id = "22409491366"
url = f'https://api.github.com/repos/Silexperience210/BitMesh/actions/runs/{run_id}/jobs'
req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github.v3+json'})
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode())
for job in data['jobs']:
    print(f"Job: {job['name']}")
    print(f"  Status: {job['status']}")
    print(f"  Conclusion: {job.get('conclusion', 'N/A')}")
    print(f"  Started at: {job.get('started_at', 'N/A')}")
    print(f"  Completed at: {job.get('completed_at', 'N/A')}")
    if job['steps']:
        print("  Steps:")
        for step in job['steps']:
            print(f"    - {step['name']}: {step['status']}")
    print()
