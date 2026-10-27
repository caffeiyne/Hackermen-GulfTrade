FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Note: db/generate_sales.py is copied via docker-compose volume mount
# The simulator command runs it before starting the API

# Expose port
EXPOSE 8000

# Default: run the API only.
# docker-compose overrides this to run generate_sales.py first.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
