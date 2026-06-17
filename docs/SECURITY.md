# MineControl OS - Security Checklist

## 🔴 Critical (Must Do)

- [ ] **Change default password** - Default is `minecraft`, change immediately
- [ ] **Keep PaperMC updated** - Check for latest security patches
- [ ] **Use strong JWT_SECRET** - Set via environment variable:
  ```bash
  export JWT_SECRET="$(openssl rand -hex 64)"
  ```
- [ ] **Enable whitelist** - In Settings → Whitelist
- [ ] **Restrict API access** - Only expose port 3001 internally

## 🟡 High Priority

- [ ] **Use HTTPS** - Set up nginx/caddy reverse proxy with SSL
- [ ] **Enable backup encryption** - In backup settings
- [ ] **Regular backups** - Auto backup is enabled by default (hourly)
- [ ] **Monitor audit logs** - Check /api/server/audit-log regularly
- [ ] **Firewall configuration**:
  ```bash
  # Linux (UFW)
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 25565/tcp
  sudo ufw allow 3001/tcp  # Only if you need remote panel access
  sudo ufw enable
  ```

## 🟢 Medium Priority

- [ ] **Rate limiting** - Enabled by default (200 req/min)
- [ ] **Session management** - Tokens expire after 24h
- [ ] **Role-based access** - Use roles to restrict permissions
- [ ] **Disable RCON** - Keep disabled unless needed
- [ ] **View distance** - Set to 8-10 for performance/security

## ⚪ Operational Security

- [ ] **OS updates** - Keep system updated
- [ ] **Java updates** - Use latest LTS version
- [ ] **Monitor logs** - Check for failed login attempts
- [ ] **Backup encryption key** - Store securely, not in .env
- [ ] **Network isolation** - Run server on separate VLAN if possible

## 🔵 Non-Premium Clients

If using offline mode (online-mode=false):
- [ ] **Do NOT expose to public internet**
- [ ] **Local network only**
- [ ] **Use strong whitelist**
- [ ] **Understand UUID spoofing risks**
- [ ] **Install anti-spoofing plugins**

## 📊 Audit Checklist

- Check audit log weekly for unauthorized access attempts
- Review player list for unknown accounts
- Verify backup integrity monthly
- Test restore procedure quarterly
- Review open ports and services

## 🚨 Incident Response

1. **Immediately:** Stop the server
2. **Isolate:** Disconnect from network
3. **Analyze:** Check logs for breach indicators
4. **Restore:** Restore from clean backup
5. **Patch:** Update all software
6. **Monitor:** Watch for recurrence

## Default Credentials

| Service | Username | Password |
|---------|----------|----------|
| MineControl OS | owner | minecraft |

**Delete this section after changing passwords!**
