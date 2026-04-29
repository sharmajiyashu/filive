# SSL Certificates

This directory contains SSL certificates for MySQL database connections.

## Files
- `ca.pem` - CA certificate for verifying the MySQL server

## Security Note
- These files are excluded from git (see .gitignore)
- Do NOT commit certificates to version control
- For team members: Copy certificates from secure storage or regenerate

## Setup
1. Copy `ca.pem` from EC2 server: `/var/lib/mysql/ssl/ca.pem`
2. Place it in this directory
3. Ensure proper file permissions