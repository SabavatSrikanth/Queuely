const Review = require('../models/Review');
const Ticket = require('../models/Ticket');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

exports.getBusinessReviews = asyncHandler(async (req, res, next) => {
  const reviews = await Review.find({ business: req.params.id })
    .populate('customer', 'name avatar')
    .sort('-createdAt');

  res.status(200).json(new ApiResponse(200, reviews, 'Reviews fetched successfully'));
});

exports.createReview = asyncHandler(async (req, res, next) => {
  const ticketId = req.params.ticketId;
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return next(new ApiError('Rating must be between 1 and 5', 400));
  }

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return next(new ApiError('Ticket not found', 404));
  }

  if (ticket.status !== 'served') {
    return next(new ApiError('Can only review served tickets', 400));
  }

  // Fixes a crash: ticket.customer is null for guest tickets, and
  // calling .toString() on null threw an uncaught TypeError (surfaced as
  // an opaque 500 instead of a clean 403). Guest tickets simply cannot be
  // reviewed by an authenticated user's identity, since there is no
  // logged-in identity tied to them.
  if (!ticket.customer || ticket.customer.toString() !== req.user.id) {
    return next(new ApiError('Not authorized to review this ticket', 403));
  }

  const existingReview = await Review.findOne({ ticket: ticketId, customer: req.user.id });
  if (existingReview) {
    return next(new ApiError('You have already reviewed this ticket', 400));
  }

  const review = await Review.create({
    ticket: ticketId,
    customer: req.user.id,
    business: ticket.business,
    branch: ticket.branch,
    service: ticket.service,
    rating,
    comment,
  });

  res.status(201).json(new ApiResponse(201, review, 'Review submitted successfully'));
});

exports.deleteReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    return next(new ApiError('Review not found', 404));
  }

  await review.deleteOne();

  res.status(200).json(new ApiResponse(200, {}, 'Review deleted'));
});
