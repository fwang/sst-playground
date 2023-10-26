FROM public.ecr.aws/lambda/python:3.8
COPY requirements.txt .
RUN pip3 install -r requirements.txt --target /var/task

COPY handler.py /var/task