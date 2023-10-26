# Python Flask Hello World

[![CI to Docker Hub](https://github.com/arska/flask-helloworld/actions/workflows/docker-image.yml/badge.svg)](https://github.com/arska/flask-helloworld/actions/workflows/docker-image.yml)

This is a very lightweight demo web application serving "Hello World" on TCP port 8080

I use it to demo application deployment to OpenShift on https://appuio.ch

* Web-GUI: "Add to project" -> search for "Python" -> Choose "Python" -> Next -> Version: 3.9 Name: flask-helloworld, Git Repository: https://github.com/arska/flask-helloworld.git -> Create -> Close

* CLI using source-to-image (s2i)
```
oc new-app python:3.9~https://github.com/arska/flask-helloworld.git; oc expose service flask-helloworld
```

* CLI using Dockerfile
```
oc new-app --strategy=docker https://github.com/arska/flask-helloworld.git; oc expose service flask-helloworld
```

You can clean up after with:
```
oc delete all -l app=flask-helloworld
```

You can also build and run this locally using docker
```
docker build -t flask-helloworld .
docker run -p 8080:8080 flask-helloworld
```
the application is then accessible at http://127.0.0.1:8080/


