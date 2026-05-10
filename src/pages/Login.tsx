import { Link } from 'react-router-dom';

function Login() {
  return (
    <section className="card card-elevated max-w-lg">
      <h2 className="sectionTitle">Account sign-in</h2>
      <p className="sectionSubtitle">
        This build runs entirely in your browser with local save data. Cloud accounts and multiplayer are not wired up
        yet.
      </p>
      <p className="text-gray-600 mt-2">
        Use <strong>Coach office</strong> from the header or home screen to continue your dynasty; no password is
        required for offline play.
      </p>
      <div className="actionRow flex gap-2 flex-wrap">
        <Link to="/career" className="btn btn-primary">
          Go to coach office
        </Link>
        <Link to="/" className="btn">
          Back to overview
        </Link>
      </div>
    </section>
  );
}

export default Login;
