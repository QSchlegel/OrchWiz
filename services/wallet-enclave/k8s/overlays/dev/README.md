Apply overlay:

```bash
kubectl apply -k services/wallet-enclave/k8s/overlays/dev
```

Port-forward:

```bash
kubectl port-forward deploy/wallet-enclave-dev 3377:3377
curl -s http://127.0.0.1:3377/health
```
