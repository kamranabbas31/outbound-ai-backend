// Extract contactId from various locations in the payload
export function extractContactId(payload) {
  console.log('=== CONTACT ID EXTRACTION DEBUG ===');
  console.log('Full payload keys:', Object.keys(payload));
  
  // Check if payload is null/undefined
  if (!payload) {
    console.log('❌ Payload is null or undefined');
    return null;
  }

  if (payload.metadata) {
    console.log('Metadata found:', JSON.stringify(payload.metadata, null, 2));
  } else {
    console.log('No metadata found at root level');
  }

  // Check message structure
  if (payload.message) {
    console.log('Message keys:', Object.keys(payload.message));
    
    if (payload.message.artifact) {
      console.log('Artifact keys:', Object.keys(payload.message.artifact));
      
      if (payload.message.artifact.assistantOverrides) {
        console.log('AssistantOverrides keys:', Object.keys(payload.message.artifact.assistantOverrides));
        
        if (payload.message.artifact.assistantOverrides.metadata) {
          console.log('Metadata keys:', Object.keys(payload.message.artifact.assistantOverrides.metadata));
          console.log('Metadata content:', JSON.stringify(payload.message.artifact.assistantOverrides.metadata, null, 2));
        }
      }
    }
  }

  // Existing conditions
  if (payload.metadata?.contactId) {
    console.log('✅ Found contactId in metadata:', payload.metadata.contactId);
    return payload.metadata.contactId;
  }
  if (payload.message?.artifact?.assistantOverrides?.metadata?.contactId) {
    console.log(
      '✅ Found contactId in message.artifact.assistantOverrides.metadata:',
      payload.message.artifact.assistantOverrides.metadata.contactId,
    );
    return payload.message.artifact.assistantOverrides.metadata.contactId;
  }
  if (payload.assistantOverrides?.metadata?.contactId) {
    console.log(
      '✅ Found contactId in assistantOverrides.metadata:',
      payload.assistantOverrides.metadata.contactId,
    );
    return payload.assistantOverrides.metadata.contactId;
  }
  if (payload.customer?.contactId) {
    console.log('✅ Found contactId in customer:', payload.customer.contactId);
    return payload.customer.contactId;
  }
  if (payload.message?.assistantOverrides?.metadata?.contactId) {
    console.log(
      '✅ Found contactId in message.assistantOverrides.metadata:',
      payload.message.assistantOverrides.metadata.contactId,
    );
    return payload.message.assistantOverrides.metadata.contactId;
  }
  if (payload.message?.metadata?.contactId) {
    console.log(
      '✅ Found contactId in message.metadata:',
      payload.message.metadata.contactId,
    );
    return payload.message.metadata.contactId;
  }

  // === NEW CONDITIONS ===
  if (payload.message?.analysis?.metadata?.contactId) {
    console.log(
      '✅ Found contactId in message.analysis.metadata:',
      payload.message.analysis.metadata.contactId,
    );
    return payload.message.analysis.metadata.contactId;
  }

  if (payload.message?.structuredData?.metadata?.contactId) {
    console.log(
      '✅ Found contactId in message.structuredData.metadata:',
      payload.message.structuredData.metadata.contactId,
    );
    return payload.message.structuredData.metadata.contactId;
  }

  if (payload.message?.artifact?.metadata?.contactId) {
    console.log(
      '✅ Found contactId in message.artifact.metadata:',
      payload.message.artifact.metadata.contactId,
    );
    return payload.message.artifact.metadata.contactId;
  }

  // Additional checks for different field names
  if (payload.message?.artifact?.assistantOverrides?.metadata?.contact_id) {
    console.log(
      '✅ Found contact_id in message.artifact.assistantOverrides.metadata:',
      payload.message.artifact.assistantOverrides.metadata.contact_id,
    );
    return payload.message.artifact.assistantOverrides.metadata.contact_id;
  }

  if (payload.message?.artifact?.assistantOverrides?.metadata?.contactid) {
    console.log(
      '✅ Found contactid in message.artifact.assistantOverrides.metadata:',
      payload.message.artifact.assistantOverrides.metadata.contactid,
    );
    return payload.message.artifact.assistantOverrides.metadata.contactid;
  }

  // Check for contactId in other possible locations
  if (payload.message?.artifact?.assistantOverrides?.contactId) {
    console.log(
      '✅ Found contactId in message.artifact.assistantOverrides:',
      payload.message.artifact.assistantOverrides.contactId,
    );
    return payload.message.artifact.assistantOverrides.contactId;
  }

  if (payload.message?.artifact?.contactId) {
    console.log(
      '✅ Found contactId in message.artifact:',
      payload.message.artifact.contactId,
    );
    return payload.message.artifact.contactId;
  }

  // Check for contactId in call object
  if (payload.message?.artifact?.call?.metadata?.contactId) {
    console.log(
      '✅ Found contactId in message.artifact.call.metadata:',
      payload.message.artifact.call.metadata.contactId,
    );
    return payload.message.artifact.call.metadata.contactId;
  }

  // Deep search for any contactId field
  const deepSearch = (obj: any, path: string = ''): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (key === 'contactId' || key === 'contact_id' || key === 'contactid') {
        console.log(`🔍 Found potential contactId at ${currentPath}:`, value);
        if (typeof value === 'string' && value.length > 0) {
          console.log(`✅ Valid contactId found at ${currentPath}:`, value);
          return value;
        }
      }
      
      if (typeof value === 'object' && value !== null) {
        const result = deepSearch(value, currentPath);
        if (result) return result;
      }
    }
    return null;
  };

  const deepSearchResult = deepSearch(payload);
  if (deepSearchResult) {
    return deepSearchResult;
  }

  // If still not found
  console.log('❌ No contactId found in any expected location');
  console.log('Full payload for debugging:', JSON.stringify(payload, null, 2));
  return null;
}

// Extract phone number from various locations in the payload
export function extractPhoneNumber(payload) {
  if (payload.customer?.number) {
    return payload.customer.number;
  }
  if (payload.message?.artifact?.customer?.number) {
    return payload.message.artifact.customer.number;
  }
  if (payload.message?.customer?.number) {
    return payload.message.customer.number;
  }
  if (payload.to) {
    return payload.to;
  }
  if (payload.message?.to) {
    return payload.message.to;
  }
  return null;
}
// Extract customer name if available
export function extractCustomerName(payload) {
  if (payload.customer?.name) {
    return payload.customer.name;
  }
  if (payload.message?.artifact?.customer?.name) {
    return payload.message.artifact.customer.name;
  }
  if (payload.message?.customer?.name) {
    return payload.message.customer.name;
  }
  return null;
}
// Extract recording URL from various locations in the payload
export function extractRecordingUrl(payload) {
  // Try different possible paths for recording URL
  if (payload.recordingUrl) {
    return payload.recordingUrl;
  }
  if (payload.message?.recordingUrl) {
    return payload.message.recordingUrl;
  }
  if (payload.recording_url) {
    return payload.recording_url;
  }
  if (payload.message?.recording_url) {
    return payload.message.recording_url;
  }
  if (payload.message?.artifact?.recordingUrl) {
    return payload.message.artifact.recordingUrl;
  }
  if (payload.call?.recordingUrl) {
    return payload.call.recordingUrl;
  }
  if (payload.message?.call?.recordingUrl) {
    return payload.message.call.recordingUrl;
  }
  if (payload.recording?.url) {
    return payload.recording.url;
  }
  if (payload.message?.recording?.url) {
    return payload.message.recording.url;
  }
  return null;
}
// Extract call duration from various possible locations
export function extractDuration(payload) {
  if (payload.durationSeconds) {
    return payload.durationSeconds;
  }
  if (payload.message?.durationSeconds) {
    return payload.message.durationSeconds;
  }
  if (payload.duration) {
    return payload.duration;
  }
  if (payload.message?.duration) {
    return payload.message.duration;
  }
  return 0;
}
// Enhanced disposition extraction function with comprehensive logging
export function extractDisposition(payload: any): string {
  console.log('=== DISPOSITION EXTRACTION DEBUG ===');
  let endReason: string | null = null;
  let summary: string | null = null;
  let transcript: string | null = null;
  let analysis: any = null;
  // Extract end_reason with comprehensive checking
  if (payload.endedReason) {
    endReason = payload.endedReason;
    console.log('Found endedReason at root:', endReason);
  } else if (payload.message?.endedReason) {
    endReason = payload.message.endedReason;
    console.log('Found endedReason in message:', endReason);
  } else if (payload.end_reason) {
    endReason = payload.end_reason;
    console.log('Found end_reason at root:', endReason);
  } else if (payload.message?.end_reason) {
    endReason = payload.message.end_reason;
    console.log('Found end_reason in message:', endReason);
  } else if (payload.message?.artifact?.endedReason) {
    endReason = payload.message.artifact.endedReason;
    console.log('Found endedReason in artifact:', endReason);
  }
  // Extract summary with comprehensive checking
  if (payload.message?.analysis?.summary) {
    summary = payload.message.analysis.summary;
    console.log(
      'Found summary in message.analysis:',
      summary ? summary.substring(0, 100) + '...' : 'Empty',
    );
  } else if (payload.analysis?.summary) {
    summary = payload.analysis.summary;
    console.log(
      'Found summary in analysis:',
      summary ? summary.substring(0, 100) + '...' : 'Empty',
    );
  } else if (payload.summary) {
    summary = payload.summary;
    console.log(
      'Found summary at root:',
      summary ? summary.substring(0, 100) + '...' : 'Empty',
    );
  } else if (payload.message?.summary) {
    summary = payload.message.summary;
    console.log(
      'Found summary in message:',
      summary ? summary.substring(0, 100) + '...' : 'Empty',
    );
  }
  // Extract analysis object for additional context
  if (payload.message?.analysis) {
    analysis = payload.message.analysis;
    console.log('Found analysis object with keys:', Object.keys(analysis));
  } else if (payload.analysis) {
    analysis = payload.analysis;
    console.log('Found analysis at root with keys:', Object.keys(analysis));
  }
  // Extract transcript with comprehensive checking
  if (payload.message?.transcript) {
    transcript = payload.message.transcript;
    console.log(
      'Found transcript in message, length:',
      transcript ? transcript.length : 0,
    );
  } else if (payload.transcript) {
    transcript = payload.transcript;
    console.log(
      'Found transcript at root, length:',
      transcript ? transcript.length : 0,
    );
  } else if (payload.message?.artifact?.transcript) {
    transcript = payload.message.artifact.transcript;
    console.log(
      'Found transcript in artifact, length:',
      transcript ? transcript.length : 0,
    );
  }
  console.log('=== EXTRACTED VALUES ===');
  console.log('End reason:', endReason);
  console.log('Summary available:', !!summary);
  console.log('Transcript available:', !!transcript);
  console.log('Analysis available:', !!analysis);
  // Combine all available content for analysis
  const contentParts: string[] = [];
  if (summary) contentParts.push(summary);
  if (transcript) contentParts.push(transcript);
  if (analysis && typeof analysis === 'object') {
    if (analysis.successEvaluation)
      contentParts.push(analysis.successEvaluation);
    if (analysis.structuredData)
      contentParts.push(JSON.stringify(analysis.structuredData));
  }
  const content = contentParts.join(' ');
  const lowerContent = content.toLowerCase();
  console.log('Combined content length:', content.length);
  console.log('Content preview:', content.substring(0, 200) + '...');
  // Check for Answering Machine first
  if (
    lowerContent.includes('leave a message') ||
    lowerContent.includes('at the tone') ||
    lowerContent.includes('voicemail') ||
    lowerContent.includes("can't take your call") ||
    lowerContent.includes('after the beep') ||
    lowerContent.includes('recording') ||
    endReason?.toLowerCase().includes('voicemail')
  ) {
    console.log('DISPOSITION: Answering Machine detected');
    return 'Answering Machine';
  }
  // Check for No Answer
  if (
    endReason?.toLowerCase().includes('customer did not answer') ||
    endReason?.toLowerCase().includes('customer-did-not-answer') ||
    endReason?.toLowerCase().includes('twilio failed connection') ||
    endReason?.toLowerCase().includes('no-answer') ||
    endReason?.toLowerCase().includes('no_answer') ||
    endReason?.toLowerCase().includes('timeout')
  ) {
    console.log('DISPOSITION: No Answer detected');
    return 'No Answer';
  }
  // Check for Warm Transfer - Education
  if (
    endReason?.toLowerCase().includes('assistant forwarded call') ||
    endReason?.toLowerCase().includes('assistant-forwarded-call') ||
    endReason?.toLowerCase().includes('forwarded') ||
    endReason?.toLowerCase().includes('transferred')
  ) {
    if (
      lowerContent.includes('education consultant') ||
      lowerContent.includes('education advisor') ||
      lowerContent.includes('forwarded to education') ||
      lowerContent.includes('transferred to education') ||
      lowerContent.includes('education') ||
      lowerContent.includes('school') ||
      lowerContent.includes('degree')
    ) {
      console.log('DISPOSITION: Warm Transfer - Education detected');
      return 'Warm Transfer - Education';
    }
    // Check for Warm Transfer - Job
    if (
      lowerContent.includes('job consultant') ||
      lowerContent.includes('job advisor') ||
      lowerContent.includes('forwarded to job') ||
      lowerContent.includes('transferred to job') ||
      lowerContent.includes('employment') ||
      lowerContent.includes('career')
    ) {
      console.log('DISPOSITION: Warm Transfer - Job detected');
      return 'Warm Transfer - Job';
    }
    // Generic warm transfer if we can't determine type
    console.log('DISPOSITION: Warm Transfer (generic) detected');
    return 'Warm Transfer';
  }
  // Check for Do Not Contact
  if (
    lowerContent.includes('do not call') ||
    lowerContent.includes("don't call") ||
    lowerContent.includes('remove me') ||
    lowerContent.includes('stop calling') ||
    lowerContent.includes('take me off') ||
    lowerContent.includes('unsubscribe') ||
    lowerContent.includes('do not contact')
  ) {
    console.log('DISPOSITION: Do Not Contact detected');
    return 'Do Not Contact';
  }
  // Check for Language Barrier
  if (
    lowerContent.includes('language barrier') ||
    lowerContent.includes('no english') ||
    lowerContent.includes("don't speak english") ||
    lowerContent.includes('habla español') ||
    lowerContent.includes('communication issue') ||
    lowerContent.includes('language problem') ||
    lowerContent.includes("can't understand")
  ) {
    console.log('DISPOSITION: Language Barrier detected');
    return 'Language Barrier';
  }
  // Check for Not Qualified
  if (
    lowerContent.includes('not qualified') ||
    lowerContent.includes('qualification failed') ||
    lowerContent.includes('no high school diploma') ||
    lowerContent.includes('no ged') ||
    lowerContent.includes('under 18') ||
    lowerContent.includes('not a us citizen') ||
    lowerContent.includes('no green card') ||
    lowerContent.includes('currently enrolled in school') ||
    lowerContent.includes('currently enrolled in college') ||
    lowerContent.includes('still in school') ||
    lowerContent.includes('still in college')
  ) {
    console.log('DISPOSITION: Not Qualified detected');
    return 'Not Qualified';
  }
  // Check for Not Interested
  if (
    lowerContent.includes('not interested') ||
    lowerContent.includes('no thanks') ||
    lowerContent.includes('not right now') ||
    lowerContent.includes('not looking') ||
    lowerContent.includes('not for me') ||
    lowerContent.includes("don't want") ||
    lowerContent.includes('no interest')
  ) {
    console.log('DISPOSITION: Not Interested detected');
    return 'Not Interested';
  }
  // Check for Hang Up based on end reason
  if (
    endReason?.toLowerCase().includes('customer ended call') ||
    endReason?.toLowerCase().includes('customer-ended-call') ||
    endReason?.toLowerCase().includes('hung up') ||
    endReason?.toLowerCase().includes('disconnected') ||  endReason?.toLowerCase().includes('assistant-ended-call') || endReason?.toLowerCase().includes('assistant ended call')
  ) {
    console.log('DISPOSITION: Hang Up detected');
    return 'Hang Up';
  }
  // Default fallback with more context
  console.log('DISPOSITION: Using fallback logic');
  if (endReason) {
    console.log('DISPOSITION: Other with end reason:', endReason);
    return endReason;
  }
  console.log('DISPOSITION: Unknown (no end reason found)');
  return 'Unknown';
}

// Determine call status based on payload
export function determineCallStatus(payload) {
  if (
    payload.success === false ||
    (payload.message && payload.message.success === false)
  ) {
    return 'Failed';
  }
  // Look for specific status indicators
  if (payload.status && typeof payload.status === 'string') {
    if (payload.status.toLowerCase().includes('fail')) {
      return 'Failed';
    }
  }
  return 'Completed';
}
// Helper function to calculate call cost
export function calculateCallCost(durationMinutes) {
  // $0.99 per minute
  const minuteRate = 0.99;
  return durationMinutes * minuteRate;
}
