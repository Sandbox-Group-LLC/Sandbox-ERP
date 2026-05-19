const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const TRACKINGPACKAGE_AUTH = process.env.TRACKINGPACKAGE_AUTH;
const RAPIDAPI_HOST = "trackingpackage.p.rapidapi.com";

export interface TrackingCheckpoint {
  timestamp: string;
  location?: string;
  status: string;
  message: string;
}

export interface TrackingResult {
  success: boolean;
  trackingNumber: string;
  carrier?: string;
  status?: string;
  estimatedDelivery?: Date | null;
  lastUpdate?: string;
  checkpoints?: TrackingCheckpoint[];
  error?: string;
}

export async function trackPackage(trackingNumber: string): Promise<TrackingResult> {
  if (!RAPIDAPI_KEY) {
    return {
      success: false,
      trackingNumber,
      error: "RapidAPI key not configured",
    };
  }

  try {
    const url = `https://${RAPIDAPI_HOST}/TrackingPackage?trackingNumber=${encodeURIComponent(trackingNumber)}`;
    
    const headers: Record<string, string> = {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
    };
    
    if (TRACKINGPACKAGE_AUTH) {
      headers["Authorization"] = TRACKINGPACKAGE_AUTH;
    }
    
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        trackingNumber,
        error: `API error: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();
    
    let estimatedDelivery: Date | null = null;
    let status: string | undefined;
    let carrier: string | undefined;
    let lastUpdate: string | undefined;
    const checkpoints: TrackingCheckpoint[] = [];

    if (data) {
      carrier = data.Carrier || data.ServiceType?.replace(/<[^>]*>/g, '') || undefined;
      status = data.Status || data.StatusCode;
      
      if (data.ScheduledDeliveryDate) {
        estimatedDelivery = new Date(data.ScheduledDeliveryDate);
      }
      
      if (data.Delivered && data.DeliveredDateTime) {
        estimatedDelivery = new Date(data.DeliveredDateTime);
      }
      
      const events = data.TrackingDetails || [];
      if (Array.isArray(events)) {
        for (const event of events) {
          if (event.EventDateTime || event.Event) {
            checkpoints.push({
              timestamp: event.EventDateTime || "",
              location: event.EventAddress?.trim() || "",
              status: event.Event || "",
              message: event.Event || "",
            });
          }
        }
        
        if (checkpoints.length > 0 && checkpoints[0].timestamp) {
          lastUpdate = checkpoints[0].timestamp;
        }
      }
    }

    return {
      success: true,
      trackingNumber,
      carrier,
      status,
      estimatedDelivery,
      lastUpdate,
      checkpoints,
    };
  } catch (error) {
    return {
      success: false,
      trackingNumber,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
