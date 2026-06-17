# MineControl OS - Troubleshooting Guide

## Server Won't Start

### "Server jar not found"
- Ensure `minecraft/server.jar` exists
- Download PaperMC from https://papermc.io/downloads
- The file should be named `server.jar`

### "Java not found"
- Install Java 17 or 21: https://adoptium.net/
- Verify with `java -version`
- Update Java path in Settings if needed

### "Port already in use"
- Another Minecraft server is running
- Change the port in Settings
- Or stop the other server first
- Check with: `netstat -ano | findstr :25565`

### "Could not create the Java Virtual Machine"
- RAM allocation too high for your system
- Reduce max RAM in Settings (try 4G instead of 8G)
- Check available RAM with Task Manager

## Server Keeps Crashing

### Out of Memory
1. Reduce max RAM by 2G
2. Install memory optimization plugins (ClearLag)
3. Reduce view distance in settings
4. Check for memory leaks in plugins

### Plugin Conflicts
1. Remove recently installed plugins
2. Check logs for error messages
3. Update all plugins to latest versions
4. Test with no plugins to isolate

### World Corruption
1. Restore from backup
2. Use `/world repair` command
3. Delete and regenerate the world

## Can't Connect to Server

### Connection Refused
- Is the server running? Check Dashboard
- Is the port correct? Default: 25565
- Is whitelist enabled? Add your username
- Firewall blocking? Allow port 25565

### Connection Timed Out
- Wrong IP address
- Port not forwarded (for external connections)
- Router firewall blocking
- ISP blocking (some block gaming ports)

### "Not Authenticated with Minecraft.net"
- Premium user using non-premium server
- Set `online-mode=true` in server.properties
- Or set up authentication properly

## Performance Issues

### Low TPS (< 15)
1. Reduce view distance (Settings → View Distance)
2. Reduce simulation distance
3. Install ClearLag plugin
4. Remove resource-heavy plugins
5. Allocate more RAM
6. Upgrade to SSD

### High Memory Usage
1. Reduce max RAM allocation
2. Install memory optimization
3. Check for memory leaks (plugin issue)
4. Restart server periodically
5. Use `/gc` command to force garbage collection

### High CPU Usage
1. Reduce entity count
2. Reduce redstone activity
3. Use performance plugins
4. Lower tick rate for less important tasks
5. Consider a more powerful CPU

## Plugin Issues

### Plugin not loading
- Incompatible with PaperMC version
- Missing dependencies
- Place .jar in `minecraft/plugins/`
- Check server logs for errors

### Plugin not working after install
- Server needs restart (not just reload)
- Check plugin docs for setup
- Verify plugin version matches server version

## Backup Issues

### Backup failing
- Check disk space
- Check write permissions on `minecraft/backups/`
- World files in use (stop server first for consistent backup)

### Restore failed
- Backup file corrupted
- Wrong backup selected
- Server must be stopped for restore

## Dashboard/UI Issues

### Page not loading
- Clear browser cache (Ctrl+Shift+Del)
- Hard refresh (Ctrl+F5)
- Check browser console for errors (F12)

### Real-time updates not working
- Socket.IO connection issue
- Check that port 3001 is accessible
- Try a different browser
- Disable browser extensions

### Login not working
- Default: `owner` / `minecraft`
- Password case-sensitive
- Clear localStorage and try again
- Reset database: delete `data/minecontrol.db` and restart

## Database Reset

To completely reset all data:
```bash
# Stop the server
# Delete database file
del data\minecontrol.db
# Or on Linux: rm data/minecontrol.db

# Restart MineControl OS
npm run dev
```

This will recreate the database with default settings and credentials.

## Getting Help

1. Check server logs in Console tab
2. Check `minecraft/logs/` directory
3. Check browser console (F12)
4. Review this troubleshooting guide
5. Open an issue on GitHub

## Common Error Messages

| Error | Solution |
|-------|----------|
| "Address already in use" | Change port or stop other process |
| "Out of memory" | Reduce max RAM, install ClearLag |
| "Plugin not found" | Place .jar in correct directory |
| "Backup file not found" | Check disk, restore from different backup |
| "Invalid token" | Re-login, clear localStorage |
| "EULA not accepted" | Delete eula.txt, restart (auto-accepted) |
| "Java not found" | Install Java 17+, check PATH |
