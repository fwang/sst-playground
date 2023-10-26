import os
import json
import numpy

payload = json.loads(os.getenv("SST_PAYLOAD"))
print(int(numpy.sqrt(payload["num"])))