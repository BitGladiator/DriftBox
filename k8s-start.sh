kubectl apply -f k8s/namespace.yml
kubectl apply -f k8s/configmap.yml
kubectl apply -f k8s/secrets.yml
kubectl apply -f k8s/statefulsets/
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/hpa/
kubectl apply -f k8s/ingress.yml
kubectl apply -f k8s/monitoring/
echo "DriftBox K8s started"
kubectl get pods -n driftbox
