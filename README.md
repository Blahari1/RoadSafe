# RoadSafe – Roadside Vehicle Assistance & Mechanic Booking Platform

RoadSafe is a web-based roadside vehicle assistance platform that connects customers with nearby mechanics. It allows customers to request vehicle repair and roadside assistance services, while mechanics can receive service requests, accept bookings, and assist customers.

The platform provides role-based access for customers, mechanics, and administrators, along with location-based mechanic discovery, service booking, real-time notifications, and service management.

## Live Application

- **Frontend:** https://road-safe-gamma.vercel.app/
- **Backend:** https://roadsafe-backend-voe4.onrender.com/
- **Backend Health Check:** https://roadsafe-backend-voe4.onrender.com/api/health
- **GitHub Repository:** https://github.com/Blahari1/RoadSafe

## Features

### 1. Customer Module
- Customer registration and login.
- Secure authentication using JWT.
- Manage personal profile.
- Add and manage vehicles.
- Submit roadside assistance requests.
- Find nearby mechanics.
- View service request status.
- Receive real-time notifications.
- View service history.
- Submit ratings and reviews.
- Access service invoices.

### 2. Mechanic Module
- Mechanic registration and login.
- Create and manage mechanic profiles.
- Admin verification of mechanic accounts.
- Receive eligible nearby service requests.
- Accept service requests.
- View customer service details.
- Receive real-time notifications.
- Manage service activities.

### 3. Admin Module
- Admin authentication.
- Manage mechanic verification.
- Review registered mechanics.
- Monitor platform activities.

### 4. Location and Real-Time Features
- Location-based mechanic discovery.
- Map integration using Leaflet.
- Display customer and mechanic locations.
- Real-time communication using Socket.IO.
- Real-time service request notifications.

### 5. Authentication and Security
- Password hashing using bcrypt.
- JWT-based authentication.
- Role-based route protection.
- Input validation.
- OTP-based password reset workflow.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React.js, Vite |
| Styling | Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Authentication | JWT, bcryptjs |
| Real-time communication | Socket.IO |
| Maps | Leaflet |
| Email service | Resend API |
| Deployment – Frontend | Vercel |
| Deployment – Backend | Render |
| API Testing | Postman |
| Database Management | MongoDB Compass |

## Project Structure

```text
RoadSafe/
│
├── client/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── context/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── server/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── tests/
│   ├── utils/
│   ├── server.js
│   └── package.json
│
└── README.md
```

*The structure above is a high-level overview; individual filenames may vary with the final repository version.*

## Installation and Setup

### Prerequisites

Install the following before running the project:

- Node.js
- npm
- MongoDB Atlas account
- Git
- VS Code (recommended)

### 1. Clone the Repository

```bash
git clone https://github.com/Blahari1/RoadSafe.git
cd RoadSafe
```

### 2. Backend Setup

```bash
cd server
npm install
```

Create a `.env` file inside the `server` directory.

Add the following environment variables:

```env
PORT=1910
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=your_token_expiry

CLIENT_URL=http://localhost:5173

MECHANIC_MAX_RADIUS_KM=your_search_radius

RESEND_API_KEY=your_resend_api_key
RESEND_FROM=your_verified_sender_address

OTP_HMAC_SECRET=your_otp_hmac_secret
```

Use your own credentials. Never commit `.env` files or expose secret keys publicly.

Start the backend using the development or start script defined in `server/package.json`.

```bash
npm run dev
```

### 3. Frontend Setup

Open another terminal:

```bash
cd client
npm install
```

Create a `.env` file inside the `client` directory:

```env
VITE_API_URL=http://localhost:1910/api
VITE_SOCKET_URL=http://localhost:1910
```

Start the frontend:

```bash
npm run dev
```

Open the local URL displayed by Vite, usually:

```text
http://localhost:5173
```

## Application Workflow

1. Customers and mechanics register on the platform.
2. Users log in using their registered credentials.
3. Mechanics complete their profiles and await administrator verification.
4. Customers add their vehicles and submit roadside assistance requests.
5. The platform identifies eligible nearby mechanics.
6. Mechanics receive service request notifications.
7. A mechanic accepts the request.
8. The customer receives an acceptance notification.
9. The customer and mechanic can use the location and tracking functionality.
10. Completed services can be recorded in service history, with ratings and invoices.

## Testing

Backend automated tests can be executed using:

```bash
cd server
npm test
```

**Latest reported test result:** 156 tests passed.

Additional testing can be performed using Postman for API endpoints and the deployed application for end-to-end functionality.

## Deployment

RoadSafe uses:

- **Vercel** for frontend deployment.
- **Render** for backend deployment.
- **MongoDB Atlas** for cloud database hosting.

Production environment variables must be configured in the respective hosting dashboards.

Frontend and backend URLs:

- Frontend: https://road-safe-gamma.vercel.app/
- Backend: https://roadsafe-backend-voe4.onrender.com/

## Known Limitation

The Forgot Password workflow includes OTP generation, verification logic, and Resend email integration.

The current production configuration uses Resend's default testing domain (`resend.dev`), which restricts email delivery to the email address associated with the Resend account. Sending password-reset emails to arbitrary users requires a verified custom domain.

This is documented as a future deployment enhancement.

## Future Enhancements

- Verify a custom email domain for unrestricted transactional email delivery.
- Integrate online payment functionality.
- Enhance live mechanic tracking and route visualization.
- Introduce advanced analytics for administrators.
- Improve mobile responsiveness and user experience.
- Add additional service categories and platform features.

## Project Objective

The main objective of RoadSafe is to simplify roadside vehicle assistance by connecting customers with nearby mechanics through a centralized digital platform.

It aims to reduce the time and effort required to find vehicle repair assistance while improving accessibility, communication, and service management.

## Author

**B. Lahari**

Computer Science and Engineering

GitHub: https://github.com/Blahari1

---

**RoadSafe – Making Roadside Assistance Easier, Faster, and More Accessible.**
