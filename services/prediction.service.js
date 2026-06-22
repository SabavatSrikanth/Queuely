const Service = require('../models/Service');

class PredictionService {
  /**
   * Update the EWMA model when a ticket is served
   * @param {Object} service - Service document
   * @param {Number} actualTime - Actual wait time in minutes
   * @param {Date} completedAt - Completion timestamp
   */
  static async updateModel(service, actualTime, completedAt) {
    const alpha = service.predictionModel.ewmaAlpha || 0.3;
    const hourSlot = completedAt.getUTCHours();
    const daySlot = completedAt.getUTCDay();

    // 1. Update EWMA global
    const oldHistoricalAvg = service.predictionModel.historicalAvgTime || service.estimatedServiceTime;
    service.predictionModel.historicalAvgTime = (alpha * actualTime) + ((1 - alpha) * oldHistoricalAvg);
    service.predictionModel.recentAvgTime = actualTime; // simplified recent

    // 2. Update hourly slot
    if (service.predictionModel.byHour && service.predictionModel.byHour[hourSlot]) {
      const slot = service.predictionModel.byHour[hourSlot];
      slot.avgTime = (alpha * actualTime) + ((1 - alpha) * (slot.avgTime || service.estimatedServiceTime));
      slot.sampleCount += 1;
    }

    // 3. Update daily slot
    if (service.predictionModel.byDayOfWeek && service.predictionModel.byDayOfWeek[daySlot]) {
      const slot = service.predictionModel.byDayOfWeek[daySlot];
      slot.avgTime = (alpha * actualTime) + ((1 - alpha) * (slot.avgTime || service.estimatedServiceTime));
      slot.sampleCount += 1;
    }

    service.predictionModel.lastUpdatedAt = new Date();
    await service.save();
  }

  /**
   * Get predicted wait time for a new joiner
   */
  static getPredictedWaitTime(service, position) {
    const currentHour = new Date().getUTCHours();
    const hourAvg = service.predictionModel.byHour?.[currentHour]?.avgTime || service.estimatedServiceTime;
    const globalAvg = service.predictionModel.historicalAvgTime || service.estimatedServiceTime;
    
    // blended: prefer time-of-day
    const blended = (0.6 * hourAvg) + (0.4 * globalAvg);
    return Math.round(position * blended);
  }
}

module.exports = PredictionService;
