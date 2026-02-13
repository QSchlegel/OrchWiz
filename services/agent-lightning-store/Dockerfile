FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

EXPOSE 4747

CMD ["agl", "store", "--host", "0.0.0.0", "--port", "4747", "--log-level", "INFO"]

