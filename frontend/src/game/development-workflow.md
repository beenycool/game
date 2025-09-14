# Game Development Workflow Guide

## Handling File System Operations

When working with multiple files that depend on each other, follow these best practices:

1. **Use Atomic Operations**
   - Check file availability before attempting operations
   - Use try-catch blocks around file I/O operations
   - Implement proper error handling and retry logic

2. **File Locking Strategy**
   - Use proper file locking mechanisms
   - Implement optimistic locking where possible
   - Add retry mechanisms with exponential backoff

3. **Batch Operations**
   - Group related file operations together
   - Use transactions where supported
   - Minimize the number of individual file operations

4. **Error Handling**
   - Always check return values
   - Use try-catch-finally for resource cleanup
   - Implement proper error reporting

## Development Workflow

For complex multi-file development:

1. **Start with Core Systems First**
   - Implement foundational systems before dependent ones
   - Create interfaces and contracts first
   - Implement in isolation with mocks

2. **Incremental Implementation**
   - Work on one system at a time
   - Test thoroughly before moving to next
   - Keep systems loosely coupled

3. **Version Control Integration**
   - Use feature branches for new functionality
   - Merge frequently to main branch
   - Use pull requests for code review

4. **Continuous Integration**
   - Set up automated builds
   - Run tests on each commit
   - Use automated deployment for testing

## File Access Patterns

When working with files that may be accessed by multiple processes:

1. **Use File Locking APIs**
   - Most languages provide file locking mechanisms
   - Use them consistently across the codebase
   - Document locking strategies

2. **Implement Retry Logic**
   - For transient errors, implement retry with backoff
   - Use circuit breakers for persistent issues

3. **Monitor File System Health**
   - Watch for disk space issues
   - Monitor I/O performance
   - Set up alerts for critical failures

## Recommended Tools

- **File System Abstraction Libraries**: Use libraries that abstract away direct file system calls
- **Dependency Injection**: For testability and flexibility
- **Mocking Frameworks**: For testing code that uses file system

## Example Implementation

```typescript
// Example of safe file operations
async function safeFileOperation(
  filePath: string, 
  operation: (file: FileHandle) => Promise<void>
): Promise<void> {
  let retries = 3;
  let delay = 1000; // Start with 1 second delay
  
  while (retries > 0) {
    try {
      const file = await openFile(filePath, 'r+');
      await operation(file);
      await file.close();
      return;
    } catch (error) {
      if (--retries === 0) {
        throw error;
      }
      await sleep(delay);
      delay *= 2; // Exponential backoff
    }
  }
}
```

This approach ensures robust file operations even in complex multi-file environments.