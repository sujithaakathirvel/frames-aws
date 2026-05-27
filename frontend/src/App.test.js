import { render, screen, waitFor } from '@testing-library/react';

jest.mock('./dynamodb', () => ({
  __esModule: true,
  default: {
    send: jest.fn(async () => ({ Items: [] })),
  },
}));

jest.mock('./s3', () => ({
  __esModule: true,
  default: {
    send: jest.fn(),
  },
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  __esModule: true,
  PutCommand: jest.fn(),
  ScanCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  DeleteCommand: jest.fn(),
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: jest.fn().mockResolvedValue({ Items: [] }),
    })),
  },
}));

jest.mock('@aws-sdk/client-s3', () => ({
  __esModule: true,
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

jest.mock('aws-amplify', () => ({
  __esModule: true,
  Amplify: {
    configure: jest.fn(),
  },
}));

jest.mock('@aws-amplify/ui-react', () => ({
  __esModule: true,
  withAuthenticator: (Component) => Component,
}));

jest.mock('@aws-amplify/ui-react/styles.css', () => ({}), { virtual: true });

import App from './App';

test('renders app title', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/Frames/i)).toBeInTheDocument();
  });
});
