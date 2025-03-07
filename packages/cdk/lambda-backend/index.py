import boto3
import json
import urllib
import random
import datetime
import time
import base64
import re
import uuid
from PIL import Image
from PIL import ImageDraw
import os
import numpy as np
from aws_xray_sdk.core import xray_recorder


s3_client = boto3.client('s3')
smr_client = boto3.client("sagemaker-runtime")
rek_client = boto3.client('rekognition')
bedrock_client = boto3.client('bedrock-runtime', region_name="us-west-2")
ddb_client = boto3.client('dynamodb')
i2t_model = "claude3"


def encode_image(img_file):
    with open(img_file, "rb") as image_file:
        img_str = base64.b64encode(image_file.read())
        base64_string = img_str.decode("latin1")
    return base64_string

def run_inference(endpoint_name, inputs):
    response = smr_client.invoke_endpoint(
        EndpointName=endpoint_name, Body=json.dumps(inputs)
    )
    return response["Body"].read().decode('utf-8')

def invoke_claude_multimodal(inputs, max_tokens_to_sample=1500): 
    # get environment variable of BEDROCK_MODEL_NAME
    model_id = os.environ['BEDROCK_MODEL_NAME']
    print(model_id)
    system_prompt = "Answer the question below. The final output should be in the JSON format."
    max_tokens = 1500
    user_message = {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": inputs["image"]
                    }
                },
                {
                    "type": "text",
                    "text": inputs["prompt"]
                }
            ]
        }
    
    system_message = {
            "role":"assistant",
            "content": [
                {
                    "type":"text",
                    "text":"{"
                }
            ]
        }
    
    messages = [user_message, system_message]
    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": messages
        }
    )
    response = bedrock_client.invoke_model(body=body, modelId=model_id)
    response_body = json.loads(response.get('body').read())
    return "{" + response_body['content'][0]['text']

def filter_rek_detect_labels(detect_labels_result):
    return [{'Name': label['Name'], 'Counts': len(label['Instances']), 'Confidence': label['Confidence'],'Position': label['Instances']} if label['Instances'] else {'Name': label['Name'], 'Confidence': label['Confidence']} for label in detect_labels_result['Labels']]

def filter_rek_detect_ppe(detect_ppe_result):
    detect_ppe_result['Persons'] = sorted(detect_ppe_result['Persons'], key=lambda k: k['BoundingBox']['Left'], reverse=False)
    return {'Number of Persons': len(detect_ppe_result['Persons']), 'Persons': [{'WorkerID': i, 'Position': person['BoundingBox'], 'HavePPE': [{part['Name']:(part['EquipmentDetections']!=[])} for part in person['BodyParts']]} for i, person in enumerate(detect_ppe_result['Persons'])], 'Current Time': detect_ppe_result['ResponseMetadata']['HTTPHeaders']['date']}

def annotate_image(file_path, rek_response, min_confidence=75):
    img = Image.open(file_path)
    img_w, img_h = img.size
    draw = ImageDraw.Draw(img)
    for label in rek_response['Labels']:
        for instance in label['Instances']:
            bbcolor = tuple(np.random.choice(range(256), size=3))
            (_, _, text_w, text_h) = draw.textbbox((0,0), label['Name'])
            if instance['Confidence'] > min_confidence:
                x1 = int((instance['BoundingBox']['Left']) * img_w)
                x2 = int((instance['BoundingBox']['Left'] + instance['BoundingBox']['Width']) * img_w)
                y1 = int((instance['BoundingBox']['Top']) * img_h)
                y2 = int((instance['BoundingBox']['Top'] + instance['BoundingBox']['Height']) * img_h)
                label_y1 = y1 if y1 <= text_h else y1 - text_h
                draw.rectangle([(x1,y1),(x2,y2)], outline=bbcolor, width=4)
                draw.rectangle([(x1,label_y1),(x1+text_w,label_y1+text_h)], outline=bbcolor, fill=bbcolor)
                draw.text((x1, label_y1), label['Name'], fill=(255,255,255), anchor='mm')
    return img

def main(event, context):
    xray_recorder.begin_segment('main')
    # save event to logs
    print(event)
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    filename = os.path.basename(key)
    file_path = '/tmp/' + datetime.datetime.now().strftime('%Y-%m-%d-%H-%M-%S-') + str(random.randint(0,999999))  + '_' + filename 
    print('filepath:', file_path)
    s3_client.download_file(bucket, key, file_path)

    min_confidence = int(os.environ.get('MIN_CONFIDENCE', '75'))

    # wait 2sec after previous invocation
    # query latest entry
    try:
        response = ddb_client.get_item(
            TableName=os.environ.get('UTIL_TABLE_NAME'),
            Key={
                'id': {'S': '1'}
            },
        )

        print(response.get('Item')['timestamp'])
        last_timestamp = float(response.get('Item')['timestamp']['S'])
        elapsed_time = time.time() - last_timestamp
        if elapsed_time < int(os.environ.get('INTERVAL_TIME')):
            print(f'wait {os.environ.get("INTERVAL_TIME")}sec')
            return {
                'statusCode': 200,
                'body': event
            }
    except:
        print('first invocation')

    ddb_client.put_item(
        TableName=os.environ.get('UTIL_TABLE_NAME'),
        Item={
            'id': {'S': '1'},
            'timestamp': {'S': str(time.time())}
        }
    )

    # get prompt id from util table
    try:
        prompt_id = ddb_client.get_item(
            TableName=os.environ.get('UTIL_TABLE_NAME'),
            Key={
                'id': {'S': 'prompt_id'}
            }).get('Item')['prompt_id']['S']
        print(prompt_id)
    except:
        # first invocation set to default
        prompt_id = 'default'
        ddb_client.put_item(
            TableName=os.environ.get('UTIL_TABLE_NAME'),
            Item={
                'id': {'S': 'prompt_id'},
                'prompt_id': {'S': prompt_id}
            }
        )

    # call rekognition detect labels
    xray_recorder.begin_subsegment('rekognition-detect-labels')
    rek_labels = rek_client.detect_labels(
        Image={
            'S3Object': {
                'Bucket': bucket,
                'Name': key
            }
        }
    )
    filtered_rek_labels = filter_rek_detect_labels(rek_labels)
    print(str(filtered_rek_labels))
    xray_recorder.end_subsegment()
    
    # call rekognition detect ppe
    xray_recorder.begin_subsegment('rekognition-detect-ppe')
    rek_ppe = rek_client.detect_protective_equipment(
        Image={
            'S3Object': {
                'Bucket': bucket,
                'Name': key
            }
        }
    )
    filtered_rek_ppe = filter_rek_detect_ppe(rek_ppe)
    print(str(filtered_rek_ppe))
    xray_recorder.end_subsegment()

    # get prompt from prompt table
    try: 
        prompt = ddb_client.get_item(
            TableName=os.environ.get('PROMPT_TABLE_NAME'),
            Key={
                'id': {'S': prompt_id}
            }).get('Item')['prompt']['S']
        print(prompt)

    except:
        print('prompt not found. use default prompt')
        prompt = """
        <instruction>
        You are an AI assistant tasked with analyzing images and determining if any accident is occuring in the scene. You will be provided with an image, the results of an image recognition model, and the results of a personal protective equipment (PPE) detection model.
        Your task is to:
        1. Answer the following question: ""Tell us what the situation is like with this image in detail. Is there any trouble going on? Generate captions in more than 3 sentences. Say in Korean."" (image_caption)
        2. Determine if there is an on-going occuring trouble or dangerous situation(classification), and output either 0 (No) or 1(Yes).
        Your output must be formatted as a JSON object with image_caption and classification keys.
        {{
        ""image_caption"": ""<caption here>"",
        ""classification"": <0 or 1>
        }}
        Please provide your analysis based on the given inputs.
        </instruction>
        <rekognition_label>{rekognition_label}</rekognition_label>
        <rekognition_ppe>{rekognition_ppe}</rekognition_ppe>
        <reference>When answering the question related to the position of the image, you can use tha fact that a value of 'Left' closer to 0.0 indicates the left side of the image, closer to 0.50 the middle, and closer to 1.0 the right side. And you can find the numbers of people in ""Number of Persons' of rekognition_ppe.</reference>
        <outputRule>The final output should be by JSON and any other characters except JSON object is prohibited to output. </outputRule>
        """
    
    base64_string = encode_image(file_path)
    inputs = {"image": base64_string, "prompt": prompt.format(rekognition_label=str(filtered_rek_labels), rekognition_ppe=str(filtered_rek_ppe))}

    # call Bedrock Claude v3 for summarizing the image
    xray_recorder.begin_subsegment('claude3-summarizing')
    llm_result = invoke_claude_multimodal(inputs)
    try:
        llm_result = json.loads(llm_result, strict = False)
        image_caption  = llm_result['image_caption']
        classification = llm_result['classification']
    except: # Except for the case the output of Claude wasn't in the JSON format
        image_caption  = "No description"
        classification = 0
    xray_recorder.end_subsegment()
    
    pattern = re.compile(r"<.*?>")
    caption = pattern.sub("", image_caption)

    print('llm:', llm_result)
    
    xray_recorder.begin_subsegment('annotate')
    # annotate image
    annotated_img = annotate_image(file_path, rek_labels, min_confidence=min_confidence)
    annotated_img_path = '/tmp/annotated_' + datetime.datetime.now().strftime('%Y-%m-%d-%H-%M-%S-') + str(random.randint(0,999999))  + '_' + filename
    annotated_img.save(annotated_img_path)

    # upload image to s3
    save_bucket_name = os.environ.get('SAVE_BUCKET_NAME')
    response = s3_client.upload_file(annotated_img_path, save_bucket_name, 'images/{}'.format(filename))
    front_s3_location = f's3://{save_bucket_name}/images/{filename}'

    xray_recorder.end_subsegment()

    # insert captioning result to dynamodb
    ddb_client.put_item(
        TableName=os.environ.get('TABLE_NAME'), 
        Item={
            'id': {'S': str(1)},
            'timestamp': {'S': str(time.time())},
            'caption': {'S': caption},
            'image_caption_model': {'S': i2t_model},
            'rekognition_labels': {'S': str(rek_labels)},
            'rekognition_ppe': {'S': str(rek_ppe)},
            's3_location': {'S': f's3://{bucket}/{key}'},
            'front_s3_location': {'S': front_s3_location},
            'classification': {'S': str(classification)}
        }
    )    

    xray_recorder.end_segment()
    return {
        'statusCode': 200,
        'body': event
    }