class K8sCrashLoopAnalyzer {
    constructor() {
        this.patterns = [
            {
                name: "ImagePullBackOff",
                regex: /ImagePullBackOff|ErrImagePull|Failed to pull image/i,
                severity: "error",
                description: "Pod cannot pull the specified container image",
                suggestions: [
                    "Check if the image name and tag are correct",
                    "Verify the image exists in the registry",
                    "Check if you have access to the private registry",
                    "Verify imagePullSecrets are configured correctly"
                ],
                docs: "https://kubernetes.io/docs/concepts/containers/images/"
            },
            {
                name: "CrashLoopBackOff",
                regex: /CrashLoopBackOff|Back-off restarting failed container/i,
                severity: "error",
                description: "Container keeps crashing and restarting",
                suggestions: [
                    "Check application logs for startup errors",
                    "Verify readiness and liveness probes",
                    "Check if the application exits immediately",
                    "Review resource limits and requests",
                    "Ensure proper signal handling in your application"
                ],
                docs: "https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#restart-policy"
            },
            {
                name: "OOMKilled",
                regex: /OOMKilled|out of memory|killed by oom-killer/i,
                severity: "error",
                description: "Container was killed due to memory limits",
                suggestions: [
                    "Increase memory limits in pod spec",
                    "Optimize application memory usage",
                    "Check for memory leaks in your application",
                    "Review memory requests vs limits"
                ],
                docs: "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"
            },
            {
                name: "Failed Mount",
                regex: /MountVolume.SetUp failed|failed to mount|Unable to attach or mount volumes/i,
                severity: "error",
                description: "Volume mounting failed",
                suggestions: [
                    "Check if PersistentVolume exists and is available",
                    "Verify StorageClass configuration",
                    "Check node permissions for volume access",
                    "Ensure volume is not already mounted elsewhere"
                ],
                docs: "https://kubernetes.io/docs/concepts/storage/persistent-volumes/"
            },
            {
                name: "Resource Limits",
                regex: /Insufficient.*resources|exceeds the maximum limit/i,
                severity: "warning",
                description: "Resource constraints preventing pod scheduling",
                suggestions: [
                    "Check cluster resource availability",
                    "Review pod resource requests and limits",
                    "Consider node scaling if needed",
                    "Check for resource quotas in namespace"
                ],
                docs: "https://kubernetes.io/docs/concepts/policy/resource-quotas/"
            },
            {
                name: "Readiness Probe Failed",
                regex: /Readiness probe failed|Liveness probe failed/i,
                severity: "warning",
                description: "Health check probes are failing",
                suggestions: [
                    "Check if the probe endpoint is correct",
                    "Verify application startup time vs probe timing",
                    "Review probe configuration (path, port, headers)",
                    "Check if the application is actually ready"
                ],
                docs: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/"
            },
            {
                name: "DNS Issues",
                regex: /no such host|dial.*no such host|DNS resolution failed/i,
                severity: "error",
                description: "DNS resolution problems",
                suggestions: [
                    "Check CoreDNS pod status",
                    "Verify service names and namespaces",
                    "Check network policies blocking DNS",
                    "Verify DNS configuration in pod spec"
                ],
                docs: "https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/"
            },
            {
                name: "Permission Denied",
                regex: /permission denied|access denied|forbidden/i,
                severity: "error",
                description: "Permission or access issues",
                suggestions: [
                    "Check ServiceAccount permissions",
                    "Review RBAC configuration",
                    "Verify file/directory permissions",
                    "Check SecurityContext settings"
                ],
                docs: "https://kubernetes.io/docs/reference/access-authn-authz/rbac/"
            },
            {
                name: "Network Issues",
                regex: /connection refused|network unreachable|timeout/i,
                severity: "warning",
                description: "Network connectivity problems",
                suggestions: [
                    "Check service endpoints",
                    "Verify network policies",
                    "Check if target service is running",
                    "Review firewall rules"
                ],
                docs: "https://kubernetes.io/docs/concepts/services-networking/"
            }
        ];
    }

    analyze(logText) {
        const issues = [];
        const lines = logText.split('\n');
        
        for (const pattern of this.patterns) {
            if (pattern.regex.test(logText)) {
                const matchingLines = lines.filter(line => pattern.regex.test(line));
                issues.push({
                    ...pattern,
                    matchingLines: matchingLines.slice(0, 3) // Show first 3 matching lines
                });
            }
        }

        // Additional heuristics
        this.addHeuristicChecks(logText, issues);
        
        return issues;
    }

    addHeuristicChecks(logText, issues) {
        // Check for high restart counts
        const restartMatch = logText.match(/Restart Count:\s*(\d+)/i);
        if (restartMatch && parseInt(restartMatch[1]) > 5) {
            issues.push({
                name: "High Restart Count",
                severity: "warning",
                description: `Pod has restarted ${restartMatch[1]} times`,
                suggestions: [
                    "Investigate why the container keeps crashing",
                    "Check application logs for recurring errors",
                    "Review startup dependencies and timing"
                ],
                docs: "https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/"
            });
        }

        // Check for pending state
        if (/Status:\s*Pending/i.test(logText)) {
            issues.push({
                name: "Pod Stuck in Pending",
                severity: "warning",
                description: "Pod is not being scheduled",
                suggestions: [
                    "Check node resources and availability",
                    "Review node selectors and affinity rules",
                    "Check for taints and tolerations",
                    "Verify resource requests don't exceed node capacity"
                ],
                docs: "https://kubernetes.io/docs/concepts/scheduling-eviction/"
            });
        }

        // Check for old age with issues
        const ageMatch = logText.match(/Age:\s*(\d+)([mhd])/i);
        if (ageMatch) {
            const value = parseInt(ageMatch[1]);
            const unit = ageMatch[2];
            let oldAge = false;
            
            if (unit === 'm' && value > 30) oldAge = true;
            if (unit === 'h' && value > 2) oldAge = true;
            if (unit === 'd') oldAge = true;
            
            if (oldAge && issues.length > 0) {
                issues.push({
                    name: "Long-running Issues",
                    severity: "info",
                    description: "Pod has been experiencing issues for an extended period",
                    suggestions: [
                        "Consider recreating the pod",
                        "Check if the issue is intermittent",
                        "Review recent changes to the deployment"
                    ],
                    docs: "https://kubernetes.io/docs/concepts/workloads/pods/"
                });
            }
        }
    }
}

function analyzeLogs() {
    const logInput = document.getElementById('logInput').value.trim();
    const resultsDiv = document.getElementById('results');
    
    if (!logInput) {
        alert('Please paste your kubectl logs or describe output');
        return;
    }
    
    const analyzer = new K8sCrashLoopAnalyzer();
    const issues = analyzer.analyze(logInput);
    
    resultsDiv.innerHTML = '';
    
    if (issues.length === 0) {
        resultsDiv.innerHTML = `
            <div class="issue info">
                <h3>✅ No Common Issues Detected</h3>
                <p>The analyzer didn't find any common Kubernetes issues in your logs. If you're still experiencing problems, consider:</p>
                <div class="suggestions">
                    <div class="suggestion">Check application-specific logs for custom errors</div>
                    <div class="suggestion">Review your application's dependencies and configuration</div>
                    <div class="suggestion">Verify external services your app depends on</div>
                </div>
            </div>
        `;
    } else {
        const issuesHtml = issues.map(issue => `
            <div class="issue ${issue.severity}">
                <h3>${getSeverityIcon(issue.severity)} ${issue.name}</h3>
                <p>${issue.description}</p>
                ${issue.matchingLines ? `
                    <div style="margin: 10px 0; padding: 10px; background: #2c3e50; color: white; border-radius: 3px; font-family: monospace; font-size: 12px;">
                        ${issue.matchingLines.map(line => `<div>${escapeHtml(line)}</div>`).join('')}
                    </div>
                ` : ''}
                <div class="suggestions">
                    <strong>Suggestions:</strong>
                    ${issue.suggestions.map(suggestion => 
                        `<div class="suggestion">• ${suggestion}</div>`
                    ).join('')}
                </div>
                <div style="margin-top: 10px;">
                    <a href="${issue.docs}" target="_blank" class="docs-link">📚 View Documentation</a>
                </div>
            </div>
        `).join('');
        
        resultsDiv.innerHTML = `
            <h2>🔍 Analysis Results (${issues.length} issue${issues.length > 1 ? 's' : ''} found)</h2>
            ${issuesHtml}
        `;
    }
    
    resultsDiv.style.display = 'block';
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

function getSeverityIcon(severity) {
    switch (severity) {
        case 'error': return '🚨';
        case 'warning': return '⚠️';
        case 'info': return 'ℹ️';
        default: return '🔍';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add sample data functionality
document.addEventListener('DOMContentLoaded', function() {
    const textarea = document.getElementById('logInput');
    
    // Add sample button
    const sampleButton = document.createElement('button');
    sampleButton.textContent = 'Load Sample Data';
    sampleButton.style.marginLeft = '10px';
    sampleButton.style.background = '#95a5a6';
    sampleButton.onclick = function() {
        textarea.value = `Name:         my-app-5d4b7c8f9b-xyz12
Namespace:    default
Priority:     0
Node:         node-1/10.0.1.100
Start Time:   Sat, 07 Jun 2025 10:30:00 +0000
Labels:       app=my-app
Annotations:  <none>
Status:       Running
IP:           10.244.1.15
IPs:
  IP:  10.244.1.15
Controlled By:  ReplicaSet/my-app-5d4b7c8f9b
Containers:
  my-app:
    Container ID:   docker://abc123def456
    Image:          my-app:v1.0.0
    Image ID:       docker-pullable://my-app@sha256:abc123
    Port:           8080/TCP
    Host Port:      0/TCP
    State:          Waiting
      Reason:       CrashLoopBackOff
    Last State:     Terminated
      Reason:       Error
      Exit Code:    1
      Started:      Sat, 07 Jun 2025 10:35:00 +0000
      Finished:     Sat, 07 Jun 2025 10:35:30 +0000
    Ready:          False
    Restart Count:  8
    Limits:
      cpu:     100m
      memory:  128Mi
    Requests:
      cpu:        100m
      memory:     128Mi
    Liveness:     http-get http://:8080/health delay=30s timeout=5s period=10s #success=1 #failure=3
    Readiness:    http-get http://:8080/ready delay=5s timeout=5s period=5s #success=1 #failure=3
    Environment:  <none>
    Mounts:
      /var/run/secrets/kubernetes.io/serviceaccount from default-token-abc123 (ro)
Conditions:
  Type              Status
  Initialized       True
  Ready             False
  ContainersReady   False
  PodScheduled      True
Volumes:
  default-token-abc123:
    Type:        Secret (a volume populated by a Secret)
    SecretName:  default-token-abc123
    Optional:    false
QoS Class:       Guaranteed
Node-Selectors:  <none>
Tolerations:     node.kubernetes.io/not-ready:NoExecute op=Exists for 300s
                 node.kubernetes.io/unreachable:NoExecute op=Exists for 300s
Events:
  Type     Reason     Age                   From               Message
  ----     ------     ----                  ----               -------
  Normal   Scheduled  10m                   default-scheduler  Successfully assigned default/my-app-5d4b7c8f9b-xyz12 to node-1
  Normal   Pulled     8m (x4 over 10m)      kubelet            Container image "my-app:v1.0.0" already present on machine
  Normal   Created    8m (x4 over 10m)      kubelet            Created container my-app
  Normal   Started    8m (x4 over 10m)      kubelet            Started container my-app
  Warning  Unhealthy  7m (x12 over 9m)      kubelet            Readiness probe failed: Get "http://10.244.1.15:8080/ready": dial tcp 10.244.1.15:8080: connection refused
  Warning  BackOff    4m (x20 over 8m)      kubelet            Back-off restarting failed container`;
    };
    
    textarea.parentNode.insertBefore(sampleButton, textarea.nextSibling);
});
