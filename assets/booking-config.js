/* EKA Forest, booking settings.
   Everything the calendar and the booking form need lives here.
   Safe to edit: these values are public (they end up in the page).
   Never put API keys or secrets in this file. */

window.EKA_BOOKING = {

  property: 'EKA Forest',

  /* The Cloudflare Worker that talks to Notion. Leave it empty to keep the
     page in offline/preview mode. */
  apiBase: 'https://eka-booking.ekaforestvattavada.workers.dev',

  /* true  = show demo availability and a simulated payment (safe for review)
     false = use the live API above; guests pay the advance by UPI */
  demo: false,

  /* Flat, non-refundable advance, in rupees. */
  advance: 2000,
  currency: 'INR',

  /* Your tents. Add, remove or rename them. capacity = how many paying guests
     share one tent. A solo guest still gets the whole tent. */
  units: [
    { id: 'tent-1', name: 'Tent 1', capacity: 2 },
    { id: 'tent-2', name: 'Tent 2', capacity: 2 },
    { id: 'tent-3', name: 'Tent 3', capacity: 2 },
    { id: 'tent-4', name: 'Tent 4', capacity: 2 },
    { id: 'tent-5', name: 'Tent 5', capacity: 2 },
    { id: 'tent-6', name: 'Tent 6', capacity: 2 },
    { id: 'tent-7', name: 'Tent 7', capacity: 2 },
    { id: 'tent-8', name: 'Tent 8', capacity: 2 },
    { id: 'tent-9', name: 'Tent 9', capacity: 2 },
    { id: 'tent-10', name: 'Tent 10', capacity: 2 },
    { id: 'tent-11', name: 'Tent 11', capacity: 2 }
  ],

  minNights: 1,
  maxNights: 10,

  /* Bookings open this many months ahead. */
  horizonMonths: 12,

  /* Largest group booked online: 11 tents × 2. Bigger groups message us. */
  maxGuestsOnline: 22,

  /* Prices in rupees. Per head per night includes tent, dinner, breakfast,
     trekking and campfire. Children 5 to 10 pay half. Under 5 is free. */
  pricing: {
    perHeadPerNight: 1850,
    childHalfPerNight: 925,
    lunchPerHeadPerDay: 250
  },

  /* Google reviews page. */
  reviewsUrl: 'https://maps.app.goo.gl/ZacFg4FmZhpEeB4y6?g_st=iw',

  /* Free date change: how many hours before check-in the guest can still
     move the booking from their manage link. */
  changeCutoffHours: 48,

  /* Where the manage/cancel page lives. Used only in preview mode;
     once the Worker is live it returns the full link itself. */
  siteUrl: 'https://ekaforest.com',
  managePath: 'manage/',

  /* Where the advance is paid. Replace the id with your own UPI ID
     (the one you use in GPay / PhonePe / Paytm, e.g. 'ekaforest@okhdfcbank').
     Once the Worker is deployed it returns UPI_ID from its settings instead,
     so this is only used in preview mode. */
  upi: {
    id: 'eka.82200883@hdfcbank',
    name: 'EKA'
  },

  whatsapp: '917012293538',            // country code, no + or spaces
  whatsappMessage: 'Hi EKA Forest, I have a question about booking a stay.',

  /* Optional: link to your full cancellation policy. */
  termsUrl: ''
};
