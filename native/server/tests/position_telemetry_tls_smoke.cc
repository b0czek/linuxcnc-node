#include <boost/asio/connect.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/asio/ssl/context.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/ssl.hpp>
#include <boost/beast/websocket.hpp>

#include <cassert>
#include <string>

namespace asio = boost::asio;
namespace beast = boost::beast;
namespace websocket = beast::websocket;
using tcp = asio::ip::tcp;

int main(int argc, char** argv) {
  assert(argc == 4 || argc == 6);
  const std::string endpoint = argv[1];
  const auto separator = endpoint.rfind(':');
  const auto host = endpoint.substr(0, separator);
  const auto port = endpoint.substr(separator + 1);
  const bool expect_rejected = std::string(argv[3]) == "--expect-rejected";

  asio::io_context io;
  asio::ssl::context tls(asio::ssl::context::tls_client);
  tls.load_verify_file(argv[2]);
  tls.set_verify_mode(asio::ssl::verify_peer);
  if (!expect_rejected) {
    tls.use_certificate_chain_file(argv[3]);
    tls.use_private_key_file(argv[4], asio::ssl::context::pem);
  }

  websocket::stream<beast::ssl_stream<beast::tcp_stream>> socket(io, tls);
  tcp::resolver resolver(io);
  beast::get_lowest_layer(socket).connect(resolver.resolve(host, port));
  beast::error_code error;
  socket.next_layer().handshake(asio::ssl::stream_base::client, error);
  if (expect_rejected) {
    if (error) return 0;
    socket.handshake(host, "/v1/position-history", error);
    return error ? 0 : 1;
  }
  assert(!error);
  socket.handshake(host, "/v1/position-history");
  beast::flat_buffer frame;
  socket.read(frame);
  assert(frame.size() >= 40);
  const auto bytes = static_cast<const unsigned char*>(frame.data().data());
  assert(bytes[0] == 'L' && bytes[1] == 'C' && bytes[2] == 'P' && bytes[3] == 'H');
  socket.close(websocket::close_code::normal);
  return 0;
}
