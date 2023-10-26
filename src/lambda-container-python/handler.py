import json
import boto3
import numpy as np

def handler(event, context):
    print(event)
    res = int(np.sqrt(25))

    return {
        'statusCode': 200,
        'body': res
    }